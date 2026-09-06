# Software Hardening Handoff

Status: implementation present, final verification in progress; NOT deployed.
User deferred physical long-run streaming and reference-angle algorithm validation.
No claim of medical accuracy, clinical readiness or batch hardware certification.

## Changed Boundaries

- New patient/device-scoped, expiring/revocable gateway credentials stored only as
  SHA-256 hashes of 256-bit random secrets. Issue from family devices or nurse patient
  record after binding devices. Plaintext is shown once; keep it off Git and logs.
- Shared `GATEWAY_API_TOKEN` is no longer accepted for uploading. Its environment
  presence remains for compatibility with the existing runtime readiness contract.
  Do not distribute it. Apply the new Prisma migration BEFORE serving this version.
- Device registration from the browser includes patientId; Android derives its
  patient scope from the credential. Device serial must match the credential AND
  persisted owner. Placement may still be reassigned within the same patient.
- Standard users cannot take another patient's device. Operator-only release for
  physically returned hardware is documented in INSTALLATION_ADMIN.md.
- Expired/revoked/wrong-scope uploads fail closed. Android must receive a new token
  before restarting collection; never work around rejection by restoring global access.
- PostgreSQL notifications are best-effort invalidation hints; authoritative data
  is always read through patient-scoped APIs. Polling remains the recovery path.
  SSE reconnects every 60 seconds to recheck access; previously open connections
  can retain event hints for at most that interval after a permission change.

## Verification and Remaining Gates

Run npm test, npm run lint, npm run build, npm run check:status, deploy tests,
Supabase static tests, and the CI PostgreSQL integration job. Local Docker daemon
was unavailable during initial work; no production data may be used as a substitute.
Record real DB test results here before declaring database validation complete.

Runbooks: OPERATIONS_READINESS.md, SUPABASE_SECURITY.md, INSTALLATION_ADMIN.md.
External prerequisites: encrypted remote backup repository and escrowed password,
alert receiver/webhook, controlled Linux host restore drill. Multi-instance rate
limiting and measured concurrency capacity remain open; do not arbitrarily scale
app replicas because notification support alone does not prove capacity or security.

No remote deployment, real hardware test, real offsite snapshot or alert delivery
has been performed in this change. Keep these distinct from mocked regression tests.
