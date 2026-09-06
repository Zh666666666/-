#!/bin/sh
set +x
set -eu
umask 077

project_dir=${TKA_PROJECT_DIR:-/opt/tka-rehab}
backup_dir=${TKA_BACKUP_DIR:-$project_dir/backups}
retention_days=${TKA_BACKUP_RETENTION_DAYS:-14}
offsite=${TKA_OFFSITE_BACKUP:-disabled}
fail() { echo "Backup failed: $1" >&2; exit 1; }
case "$retention_days" in ''|*[!0-9]*) fail 'invalid retention days';; esac
[ "$retention_days" -ge 1 ] || fail 'retention must be at least one day'
case "$backup_dir" in /*) ;; *) fail 'backup directory must be absolute';; esac
case "$offsite" in
  disabled)
    [ -z "${RESTIC_REPOSITORY:-}${RESTIC_REPOSITORY_FILE:-}${RESTIC_PASSWORD_FILE:-}${RESTIC_PASSWORD:-}${RESTIC_PASSWORD_COMMAND:-}" ] || fail 'restic configuration present but offsite mode is disabled'
    ;;
  restic)
    command -v restic >/dev/null 2>&1 || fail 'restic is required'
    case "${RESTIC_REPOSITORY:-}" in s3:*|sftp:*|rest:https:*|azure:*|gs:*|b2:*|rclone:*) ;; *) fail 'explicit remote restic repository required';; esac
    [ -z "${RESTIC_REPOSITORY_FILE:-}${RESTIC_PASSWORD:-}${RESTIC_PASSWORD_COMMAND:-}" ] || fail 'use repository and password-file configuration only'
    [ -f "${RESTIC_PASSWORD_FILE:-}" ] && [ -s "$RESTIC_PASSWORD_FILE" ] && [ -r "$RESTIC_PASSWORD_FILE" ] || fail 'restic password file is missing or unreadable'
    case "$(stat -c %a "$RESTIC_PASSWORD_FILE")" in 400|600) ;; *) fail 'restic password file must have mode 400 or 600';; esac
    ;;
  *) fail 'invalid offsite mode';;
esac
for tool in docker flock timeout; do
  command -v "$tool" >/dev/null 2>&1 || fail 'required host tool missing'
done

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cd "$project_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || fail 'another backup is running'
temporary=$(mktemp "$backup_dir/.backup-XXXXXXXX")
destination="$backup_dir/tka-rehab-$(date -u +%Y%m%dT%H%M%SZ)-${temporary##*-}.dump"

cleanup() {
  rm -f "$temporary" "$backup_dir/.success.tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

timeout 1800 docker compose -f compose.production.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$temporary" 2>/dev/null || fail 'database dump failed'

[ -s "$temporary" ] || fail 'database dump is empty'
timeout 120 docker compose -f compose.production.yml exec -T db \
  pg_restore --list < "$temporary" >/dev/null 2>&1 || fail 'archive validation failed'
mv "$temporary" "$destination"
chmod 600 "$destination"
# Publish success only after the configured durability requirement is met.
if [ "$offsite" = restic ]; then
  timeout 1800 restic backup --quiet --tag tka-rehab -- "$destination" >/dev/null 2>&1 || fail 'encrypted offsite upload failed; local dump retained'
  date +%s > "$backup_dir/.success.tmp"
  mv "$backup_dir/.success.tmp" "$backup_dir/.offsite-success"
fi
date +%s > "$backup_dir/.success.tmp"
mv "$backup_dir/.success.tmp" "$backup_dir/.backup-success"
find "$backup_dir" -type f -name 'tka-rehab-*.dump' -mtime "+$retention_days" -delete

echo "Database backup completed (offsite: $offsite)."
