#!/bin/sh
set -eu

project_dir=${TKA_PROJECT_DIR:-/opt/tka-rehab}
backup_dir=${TKA_BACKUP_DIR:-$project_dir/backups}
retention_days=${TKA_BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_dir/tka-rehab-$timestamp.dump"
temporary="$destination.tmp"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cd "$project_dir"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT INT TERM

docker compose -f compose.production.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$temporary"

test -s "$temporary"
mv "$temporary" "$destination"
chmod 600 "$destination"
find "$backup_dir" -type f -name 'tka-rehab-*.dump' -mtime "+$retention_days" -delete

echo "Database backup created: $destination"
