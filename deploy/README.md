# Self-hosted production deployment

The production stack uses Docker Compose with three services:

- `caddy`: public HTTP/HTTPS and automatic ACME certificates;
- `app`: Next.js, Prisma migrations, local signed-session authentication and gateway token checks;
- `db`: private PostgreSQL storage with a named volume.

The server-only `.env.production` must define:

```dotenv
APP_MODE=production
AUTH_MODE=local
NODE_ENV=production
DOMAIN=www.example.com
ROOT_DOMAIN=example.com
SERVER_IP=203.0.113.10
ACME_EMAIL=admin@example.com
NEXT_PUBLIC_APP_URL=https://www.example.com
POSTGRES_DB=tka_rehab
POSTGRES_USER=tka_app
POSTGRES_PASSWORD=<random-alphanumeric-password>
DATABASE_URL=postgresql://tka_app:<same-password>@db:5432/tka_rehab
DIRECT_URL=postgresql://tka_app:<same-password>@db:5432/tka_rehab
GATEWAY_API_TOKEN=<random-32-byte-token>
LOCAL_AUTH_SESSION_SECRET=<random-48-byte-secret>
LOCAL_FAMILY_EMAIL=<family-login-email>
LOCAL_FAMILY_PASSWORD=<random-password-at-least-12-characters>
LOCAL_NURSE_EMAIL=<nurse-login-email>
LOCAL_NURSE_PASSWORD=<random-password-at-least-12-characters>
NEXT_PUBLIC_REGISTRATION_ENABLED=true
REGISTRATION_INVITE_CODE=<random-care-team-invite-code>
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=TKA Rehab <verify@updates.example.com>
AI_RESPONSES_BASE_URL=https://api.openai.com
AI_RESPONSES_MODEL=gpt-5.5
AI_RESPONSES_REASONING_EFFORT=xhigh
AI_RESPONSES_API_KEY=<server-side-provider-key>
AI_RESPONSES_ACTOR_AUTHORIZATION=
```

`ROOT_DOMAIN` receives its own automatic certificate and permanently redirects
to `DOMAIN`, preserving the request path and query string.

Email registration is optional and fail-closed. Verify a dedicated sending
subdomain with Resend, set all four registration variables, then rebuild the app
so `NEXT_PUBLIC_REGISTRATION_ENABLED=true` is included in the client bundle.
Public registration creates family accounts only and requires the care-team
invite code; nurse accounts remain administrator-provisioned.

AI analysis is manual and fail-closed. `POST /api/ai-analyses` first recomputes
the latest hardware session's synchronization, calibration, ROM, repetition,
duration and quality metrics. The external Responses API is called only when
that deterministic quality gate passes. Provider failures never fall back to a
fabricated report. Custom OpenAI-compatible providers may omit
`AI_RESPONSES_API_KEY` and use `AI_RESPONSES_ACTOR_AUTHORIZATION` instead.

Deploy and initialize without adding fake sensor readings:

```bash
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < deploy/seed-production.sql
docker compose -f compose.production.yml ps
```

Run the repeatable production acceptance check from the app container:

```bash
docker compose -f compose.production.yml exec -T app \
  node deploy/verify-production.mjs
```

Back up the database:

```bash
sh deploy/backup.sh
```

The script writes a validated custom-format PostgreSQL dump under `backups/`
and removes dumps older than 14 days. Schedule it daily on the host; database
backups must also be copied to a separate machine or object store before this is
treated as a disaster-recovery solution.

Install the included systemd timer on a Linux host:

```bash
install -m 0755 deploy/backup.sh /opt/tka-rehab/deploy/backup.sh
install -m 0644 deploy/tka-backup.service /etc/systemd/system/tka-backup.service
install -m 0644 deploy/tka-backup.timer /etc/systemd/system/tka-backup.timer
systemctl daemon-reload
systemctl enable --now tka-backup.timer
```

Only ports 22, 80 and 443 should be open on the host. PostgreSQL and Next.js
remain private Docker services. Do not commit `.env.production`, database dumps,
login credentials or gateway tokens.

After verifying key-based SSH access, install `deploy/sshd-tka.conf` under
`/etc/ssh/sshd_config.d/`, validate with `sshd -t`, reload SSH, and verify a new
key-authenticated session before closing the existing session. The host firewall
should allow only SSH, HTTP, HTTPS/TCP and HTTPS/UDP inbound traffic.
