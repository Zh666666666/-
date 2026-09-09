#!/bin/sh
set +x
set -eu
umask 077

fail() { echo "Restore drill failed: $1" >&2; exit 1; }
[ "$#" -eq 1 ] || fail 'provide one trusted custom-format dump file'
[ -f "$1" ] && [ -s "$1" ] || fail 'dump file is missing or empty'
for tool in docker timeout; do
  command -v "$tool" >/dev/null 2>&1 || fail 'required host tool missing'
done
# No caller-selected container, database, URL, mounts, or Compose project.
# pg_restore can execute SQL from the archive: accept trusted backups only.
container=
cleanup() {
  result=$?
  trap - EXIT
  if [ -n "$container" ]; then
    timeout 60 docker rm -f -v "$container" >/dev/null 2>&1 || {
      echo 'Restore drill cleanup failed; remove the container labeled tka.restore-drill=true.' >&2
      result=1
    }
  fi
  if [ "$result" -eq 0 ]; then
    echo 'Restore drill passed: archive restored, application tables queried, isolated container removed.'
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
container=$(timeout 60 docker create --pull=never --network none \
  --label tka.restore-drill=true --memory 1g --cpus 1 --pids-limit 256 \
  --security-opt no-new-privileges --read-only \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=2147483648 \
  --tmpfs /var/run/postgresql:rw,noexec,nosuid,size=16777216 \
  --tmpfs /tmp:rw,noexec,nosuid,size=67108864 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=drill \
  -e POSTGRES_DB=drill postgres:16-alpine 2>/dev/null) || fail 'isolated container creation failed (pre-pull postgres:16-alpine)'
[ -n "$container" ] || fail 'no isolated container ID returned'
timeout 60 docker start "$container" >/dev/null 2>&1 || fail 'isolated PostgreSQL start failed'
attempt=0
# The entrypoint's temporary initialization server only listens on a Unix socket.
until timeout 5 docker exec "$container" pg_isready -h 127.0.0.1 -U drill -d drill >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || fail 'isolated PostgreSQL did not become ready'
  sleep 2
done
timeout 1800 docker exec -i "$container" pg_restore \
  --exit-on-error --single-transaction --no-owner --no-privileges \
  -U drill -d drill < "$1" >/dev/null 2>&1 || fail 'archive restore failed'
# Counts exercise application tables without printing any patient information.
timeout 120 docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U drill -d drill \
  -c 'SELECT count(*) FROM public.patients; SELECT count(*) FROM public.sensor_samples; SELECT count(*) FROM public."_prisma_migrations";' \
  >/dev/null 2>&1 || fail 'restored application schema verification failed'
