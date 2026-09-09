#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
mkdir "$tmp/bin" "$tmp/project" "$tmp/backups"
for tool in docker restic flock timeout; do
  cp "$root/deploy/tests/mock-command.sh" "$tmp/bin/$tool"
  chmod +x "$tmp/bin/$tool"
done
export PATH="$tmp/bin:$PATH" MOCK_LOG="$tmp/commands"
export TKA_PROJECT_DIR="$tmp/project" TKA_BACKUP_DIR="$tmp/backups"
unset RESTIC_REPOSITORY RESTIC_REPOSITORY_FILE RESTIC_PASSWORD RESTIC_PASSWORD_FILE RESTIC_PASSWORD_COMMAND
export TKA_OFFSITE_BACKUP=disabled
export DATABASE_URL='postgresql://production-secret@production/db'
export DOCKER_HOST='do-not-connect-tests-use-mocks'
passed=0
run() {
  expected=$1; shift
  : > "$MOCK_LOG"
  result=0
  sh "$@" > "$tmp/output" 2>&1 || result=$?
  if { [ "$expected" = pass ] && [ "$result" -ne 0 ]; } ||
     { [ "$expected" = fail ] && [ "$result" -eq 0 ]; }; then
    cat "$tmp/output"
    echo "Unexpected result: $*" >&2
    exit 1
  fi
  if grep -q 'SECRET-MUST-NOT-LEAK\|production-secret' "$tmp/output"; then
    echo 'Secret leaked' >&2; exit 1
  fi
  passed=$((passed + 1))
}
run pass "$root/deploy/backup.sh"
test -s "$tmp/backups/.backup-success"
test ! -e "$tmp/backups/.offsite-success"
for failure in dump archive lock; do
  export MOCK_FAIL=$failure
  printf '123\n' > "$tmp/backups/.backup-success"
  run fail "$root/deploy/backup.sh"
  test "$(cat "$tmp/backups/.backup-success")" = 123
done
unset MOCK_FAIL
export TKA_BACKUP_RETENTION_DAYS=-1
run fail "$root/deploy/backup.sh"
unset TKA_BACKUP_RETENTION_DAYS
export RESTIC_REPOSITORY='s3:https://storage.invalid/bucket'
run fail "$root/deploy/backup.sh"
test ! -s "$MOCK_LOG"
export TKA_OFFSITE_BACKUP=restic
run fail "$root/deploy/backup.sh"
test ! -s "$MOCK_LOG"
printf 'test-only-password\n' > "$tmp/password"
chmod 600 "$tmp/password"
export RESTIC_PASSWORD_FILE="$tmp/password"
# Git Bash cannot represent Unix 0600; mock stat only for shell flow tests there.
case "$(uname -s)" in MINGW*|MSYS*)
  cp "$root/deploy/tests/mock-stat.sh" "$tmp/bin/stat"
  chmod +x "$tmp/bin/stat";;
esac
run pass "$root/deploy/backup.sh"
test -s "$tmp/backups/.offsite-success"
grep -q 'restic backup --quiet --tag tka-rehab -- ' "$MOCK_LOG"
printf '123\n' > "$tmp/backups/.backup-success"
printf '123\n' > "$tmp/backups/.offsite-success"
touch -t 202001010000 "$tmp/backups/tka-rehab-old.dump"
export MOCK_FAIL=offsite
run fail "$root/deploy/backup.sh"
test "$(cat "$tmp/backups/.backup-success")" = 123
test "$(cat "$tmp/backups/.offsite-success")" = 123
test -f "$tmp/backups/tka-rehab-old.dump"
unset MOCK_FAIL
export RESTIC_REPOSITORY="$tmp/local-repository"
run fail "$root/deploy/backup.sh"
test ! -s "$MOCK_LOG"
printf 'trusted-test-archive\n' > "$tmp/archive.dump"
run pass "$root/deploy/restore-drill.sh" "$tmp/archive.dump"
grep -q -- '--network none' "$MOCK_LOG"
grep -q -- '--read-only' "$MOCK_LOG"
grep -q -- 'pg_isready -h 127.0.0.1 -U drill -d drill' "$MOCK_LOG"
grep -q -- '--tmpfs /var/lib/postgresql/data:' "$MOCK_LOG"
grep -q -- '--exit-on-error --single-transaction --no-owner --no-privileges -U drill -d drill' "$MOCK_LOG"
grep -q '^docker rm -f -v isolated-test-container$' "$MOCK_LOG"
if grep -Eq 'compose|production-secret|--volume|--mount|--publish|--network host' "$MOCK_LOG"; then
  echo 'Restore isolation violation' >&2; exit 1
fi
for failure in start restore schema cleanup; do
  export MOCK_FAIL=$failure
  run fail "$root/deploy/restore-drill.sh" "$tmp/archive.dump"
  grep -q '^docker rm -f -v isolated-test-container$' "$MOCK_LOG"
done
unset MOCK_FAIL
run fail "$root/deploy/restore-drill.sh" "$tmp/missing.dump"
test ! -s "$MOCK_LOG"
run fail "$root/deploy/restore-drill.sh" "$tmp/archive.dump" production
test ! -s "$MOCK_LOG"
echo "Passed $passed mocked shell scenarios (no real Docker/restic calls)."
