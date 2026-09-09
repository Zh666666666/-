# Operations Readiness

## Scope and Release Gate

These tools support the existing Linux Docker Compose / PostgreSQL 16 deployment.
They do not deploy the app, run migrations, seed data, change authentication, or
restore into the production database. Application acceptance remains a separate
release gate using `deploy/verify-production.mjs` and the release checklist.

Do not declare disaster recovery ready until an operator has recorded:

- A successful encrypted snapshot in a separately administered remote repository.
- A restore drill using a dump recovered from that repository, not just a local copy.
- A production health check and a deliberately triggered alert received by an owner.
- Approved recovery point/time objectives, retention, data location and access owners.
- A tested recovery path for secrets, host configuration and any external services.

Suggested initial objectives to approve: daily backups (RPO 24 hours), monitor
every five minutes, alert at 26 hours without a successful backup, weekly restore
drill and after database upgrades. RTO must be measured, not assumed. This is
logical database backup, not point-in-time recovery; writes after a snapshot can
be lost. Database dumps contain sensitive patient data. Local dumps are plaintext
with private permissions: use an encrypted host disk and tightly restricted access.
Restic encrypts and authenticates remote data. Do not substitute unauthenticated
`openssl enc` files or plain file copies for this remote backup requirement.

## Host Prerequisites

Use a controlled Linux host with POSIX shell, GNU coreutils (including `timeout`,
`stat`, `mktemp`), `flock` from util-linux, Docker Engine with Compose, restic,
OpenSSL for initial password generation, systemd, and Node.js 22 or newer.
Install maintained versions from approved OS/vendor packages. The systemd monitor
assumes `/usr/bin/node`; override its unit if Node is installed elsewhere.
Docker access is effectively root access. Repository code and configuration must
not be writable by untrusted users.

The backup source is always the `db` service in `compose.production.yml`, using
the credentials already inside that container. It does not consume a host
`DATABASE_URL`. Restore drills never use Compose, a caller-provided database URL,
or an existing database container.

Provision a remote restic backend (S3, SFTP, HTTPS REST, Azure, GCS, B2 or rclone).
Use a separate machine/account or object store, TLS or verified SSH host keys,
least-privilege credentials, and an approved data residency policy. SFTP must be
noninteractive with preverified known_hosts; never disable host key checking.
Prefer provider-side immutability/versioning and separate retention credentials.
Some restic backends need lock deletion even for backup; test the exact IAM policy.
Local paths are rejected as offsite repositories. A remote-looking URL alone is
not proof of a separate failure domain; the operator must verify that property.

## Private Configuration

The following commands are instructions for an authorized operator, not actions
performed by this change. Adapt `/opt/tka-rehab` if the checkout is elsewhere.
Keep configuration, credentials, downloaded dumps and reports outside Git.
Never run these tools with shell tracing or put secrets into command arguments.

```sh
sudo install -d -m 0700 /etc/tka /var/backups/tka-rehab
sudo sh -c 'umask 077; openssl rand -base64 48 > /etc/tka/restic-password'
sudo install -m 0600 /dev/null /etc/tka/operations.env
sudoedit /etc/tka/operations.env
```

Generate the password only once for a new repository. Never overwrite the password
for an existing repository. Keep a second recoverable copy in the approved secret
manager; loss of the password means loss of the encrypted backups.

Example non-secret configuration (replace the endpoint and provision provider
credentials privately using the backend's supported environment variables):

```dotenv
TKA_PROJECT_DIR=/opt/tka-rehab
TKA_BACKUP_DIR=/var/backups/tka-rehab
TKA_BACKUP_RETENTION_DAYS=14
TKA_OFFSITE_BACKUP=restic
RESTIC_REPOSITORY=s3:https://storage.example.com/tka-backups
RESTIC_PASSWORD_FILE=/etc/tka/restic-password
RESTIC_CACHE_DIR=/var/cache/tka-restic
TKA_MONITOR_URL=https://rehab.example.com
TKA_BACKUP_MAX_AGE_HOURS=26
TKA_MONITOR_TIMEOUT_MS=10000
TKA_MONITOR_WEBHOOK_FILE=/etc/tka/monitor-webhook
```

Keep this file root-owned, mode 0600. Use simple `KEY=value` assignments compatible
with both shell and systemd; it is trusted executable input when sourced in shell.
Do not copy the app's `.env.production` into it. Password files must be mode 0400
or 0600. `RESTIC_PASSWORD`, `RESTIC_PASSWORD_COMMAND` and
`RESTIC_REPOSITORY_FILE` are deliberately rejected to avoid ambiguous sources.
No script initializes or replaces a repository automatically.

Initialize a NEW remote repository only after checking the destination:

```sh
sudo -i
set +x
set -a
. /etc/tka/operations.env
set +a
restic init
restic snapshots
exit
```

Backend commands can print endpoints or error details; keep their terminal output
private. The automated backup suppresses backend diagnostics to avoid leaking
credentials. Diagnose failures manually in a restricted session, never by turning
on tracing in scheduled jobs.

For a deliberately local-only setup, set `TKA_OFFSITE_BACKUP=disabled` and remove
all `RESTIC_*` repository/password settings. This is not disaster-recovery ready.
Any unsupported mode, partial required configuration, bad password permissions,
missing tool, failed dump/archive listing, or failed remote upload returns nonzero.
When remote upload fails, the new local dump is retained but success timestamps
and retention cleanup are not advanced. Upload errors never silently fall back
to local-only success. Local retention runs only after the full backup succeeds;
repeated failures can fill disk and require operator attention.

## Install and Run

The service now requires `/etc/tka/operations.env`; create it before replacing
an existing backup unit. Review unit paths and preserve any site-specific overrides.
There is no automatic package installation or timer activation by these scripts.

```sh
cd /opt/tka-rehab
sudo install -m 0644 deploy/tka-backup.service deploy/tka-backup.timer /etc/systemd/system/
sudo install -m 0644 deploy/tka-monitor.service deploy/tka-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start tka-backup.service
sudo systemctl start tka-monitor.service
sudo systemctl enable --now tka-backup.timer tka-monitor.timer
sudo systemctl list-timers 'tka-*'
sudo journalctl -u tka-backup.service -u tka-monitor.service --since today
```

Inspect exit status and remote snapshots before enabling timers. The backup lock
prevents overlapping jobs sharing the same backup directory. Dump files and
timestamp markers are published by atomic rename. Archive listing detects basic
format failures but is not a restore test. `pg_dump` and restic each have a
30-minute timeout; systemd caps the complete job at 65 minutes. Tune with measured
data sizes and review alert thresholds if these limits are insufficient.

Remote retention is intentionally NOT automated here. Have a separate authorized
retention job use a reviewed `restic forget` policy and `prune`, scoped to this
repository/tag (`tka-rehab`). Never prune the only known recoverable snapshot.
Schedule `restic check --read-data` on a suitable isolated host periodically;
this reads remote contents and incurs bandwidth/cost. Protect the local restic
cache and monitor host disk capacity independently.

## Isolated Restore Drill

Use a separate, trusted Docker host for production data drills when possible.
Pre-pull the reviewed `postgres:16-alpine` image (same major version as production);
the script uses `--pull=never`. Review image provenance/digest at each upgrade.
The drill allocates a new container with no network, no published ports, no bind
mounts, no production volumes, a read-only root filesystem, capped CPU/memory/PIDs,
and temporary PostgreSQL storage. It receives only the dump through standard input.
Do not feed untrusted archives: restoring a dump executes SQL. Container isolation
is not a substitute for trusting the backup source.

Recover a specific verified snapshot, not an unreviewed `latest` snapshot:

```sh
sudo -i
set +x
set -a
. /etc/tka/operations.env
set +a
umask 077
recovery_dir=$(mktemp -d /var/tmp/tka-recovery-XXXXXXXX)
restic snapshots --tag tka-rehab
# Replace SNAPSHOT_ID with a reviewed ID. Output contains sensitive paths.
restic restore SNAPSHOT_ID --target "$recovery_dir"
docker pull postgres:16-alpine
# Replace this path with the exact recovered custom-format dump.
sh /opt/tka-rehab/deploy/restore-drill.sh "$recovery_dir/var/backups/tka-rehab/EXACT_DUMP.dump"
exit
```

There is intentionally no production restore mode or target override. A successful
drill runs `pg_restore --exit-on-error --single-transaction` and read-only counts
against `patients`, `sensor_samples` and `_prisma_migrations`. Empty tables are
allowed; this does not prove every business invariant, row count, role privilege,
or external service can be recovered. Owners/ACLs are omitted for isolation, so
recreating production database roles/permissions is a separate recovery task.

The drill has a 1 GiB RAM limit and 2 GiB temporary database capacity. Larger
databases need a reviewed adjustment to these script limits on a dedicated host;
resource exhaustion must fail, not redirect restoration into production. PostgreSQL
readiness is bounded, restore is capped at 30 minutes, and query checks at two.
Cleanup removes only the newly returned container ID, including its anonymous
volumes, on normal exit and handled interrupts. Cleanup failure returns nonzero.
SIGKILL, host loss, or interruption during container creation may leave a container:

```sh
docker ps -a --filter label=tka.restore-drill=true
# Inspect the exact ID and mounts before removal; never use compose down -v.
docker inspect EXACT_DRILL_CONTAINER_ID
docker rm -f -v EXACT_DRILL_CONTAINER_ID
```

Privately record snapshot ID/time, start/end times, script revision, result and
cleanup outcome. Remove only the exact recovered plaintext directory after
checking its resolved path; do not retain patient dumps in a checkout or test logs.
No automatic production data writes, remote pruning or dump deletion happen in
the restore script. Full disaster recovery requires a separately authorized plan.

## Monitoring and Alerts

`node deploy/health-monitor.mjs` is a one-shot check. Exit 0 means production
liveness/readiness and required backup freshness passed; any failed check exits 1.
It rejects redirects, invalid JSON, demo mode, non-PostgreSQL storage and false
readiness. Requests have bounded time and response size. HTTPS is required unless
`TKA_MONITOR_ALLOW_HTTP=true` is explicitly set for a controlled local test.
Do not disable TLS verification. The URL must be an origin, without credentials,
query or path. No login credentials are needed or sent.

The monitor checks `.backup-success`, and with `TKA_OFFSITE_BACKUP=restic` also
`.offsite-success`, in `TKA_BACKUP_DIR`. These contain Unix timestamps and are
updated by successful backup runs. Missing, stale, malformed or future-dated
markers fail. They prove job success, not ongoing repository integrity or the
continued existence of a local archive; remote checks and restore drills remain
mandatory. Keep backup and monitor configuration identical and protect these files.

For optional alerts, create `/etc/tka/monitor-webhook` mode 0600 containing a single
HTTPS webhook URL using the secret manager or `sudoedit`. Do not place it in Git,
command arguments or tickets. The receiver must accept JSON `{ "text": "..." }`.
Only fixed issue codes are sent, never endpoint URLs, response bodies, credentials,
dump names or patient information. Failed webhook delivery adds an error and never
turns a failed check into success. Each failed run sends a notification; configure
deduplication/escalation at the receiver. There are no recovery notifications.

Acceptance: with approval, use a temporary monitor config pointing to an unreachable
test origin, run a one-shot check, confirm nonzero status and alert receipt, then
restore the correct configuration and confirm success. Do not take production down
to test alerting. Invalid numeric monitor configuration exits nonzero before sending
a webhook. Monitor the timer/job itself with an independent external uptime service:
a dead host or broken scheduler cannot send its own alert.

## Verification and Remaining Blockers

Local non-production tests (no package changes required):

```sh
sh -n deploy/backup.sh
sh -n deploy/restore-drill.sh
sh deploy/tests/operations-shell.test.sh
node --test deploy/tests/health-monitor.test.mjs
```

The shell suite uses command doubles, not real dumps or remote credentials. It
checks failure status, stale-marker preservation, retention on upload failure,
isolation arguments and cleanup. On Git Bash only, password mode checking is
mocked because Windows cannot reproduce Linux file modes. The monitor webhook
permission test is skipped on Windows; run the full suite on Linux before handover.

This implementation has NOT deployed, initialized a repository, installed units,
or contacted production. External blockers: a running Linux Docker engine and
approved image; Linux permission/systemd verification; remote storage and IAM/SSH
configuration; escrowed encryption password; real encrypted upload/download and
restore evidence; production HTTPS origin; webhook receiver and confirmed delivery;
independent uptime/disk monitoring; approved retention, RPO/RTO and on-call owner.
App/auth tests and project status/work-log updates belong to the main release agent.

Local evidence (2026-09-06, Windows/Git Bash): 17 mocked shell scenarios passed;
8 Node monitor tests passed, 1 Unix-permission/webhook test skipped; shell syntax
and scoped diff whitespace checks passed. Docker's Linux engine was unavailable,
so no real PostgreSQL restore or restic transfer was verified. `check:status`
reported the pending main-agent project-status update; this task did not edit it.
