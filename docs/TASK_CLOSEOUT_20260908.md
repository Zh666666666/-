# Task Closeout - 2026-09-08

## Verdict

The software hardening branch is implemented and core CI-tested, not merged or
deployed. It is not evidence of medical accuracy or readiness for batch production.
PR: https://github.com/Zh666666666/-/pull/50
Verified CI: https://github.com/Zh666666666/-/actions/runs/34203633203

## Acceptance Matrix

| Area | Implemented / verified | Remaining acceptance |
| --- | --- | --- |
| Permission isolation | Hashed patient/device-scoped credentials, expiry/revocation, device ownership, scoped upload routes; real PostgreSQL cross-account and lifecycle tests pass | Apply migration and issue new App credentials during controlled deployment; verify real production account flows. Serial matching is not physical device cryptographic attestation |
| Realtime stability | Existing batching/idempotency plus cross-process notification and reconnect authorization; regression and real DB notification tests pass | Long dual-sensor run, measured end-to-end latency, backlog convergence, network recovery, reconnect and duplicate delivery on actual phones |
| Algorithm credibility | Existing deterministic metrics and quality gates retained | Reference-angle ROM error distribution, normal-motion false-positive rate, repeatability after recalibration, documented acceptance thresholds; no accuracy claim |
| Business loop | Two-nurse/two-family access, profile propagation, competing binding, handoff and unlink concurrency tested against real PostgreSQL | Full browser/email registration, password reset, history, nurse guidance and alert handling on the deployed version with dedicated test accounts |
| Batch operations | Inventory and nurse/device lifecycle CLI; backup/monitor/restore tooling; synthetic DB restored successfully into an isolated container | Real offsite storage and alert receiver absent; production recovery drill, measured concurrent capacity, shared multi-instance rate limiting, release/rollback rehearsal, hardware factory QC and fleet update process |

## Evidence and Boundaries

### Follow-up: 2026-09-09

- Exact code head d9b124c passed CI run 34245695018.
- Production still runs 2237311; no merge, application deployment or production
  migration was performed in this follow-up.
- Created a private real production dump (1,374,947 bytes) and successfully restored
  it using the hardened isolated restore-drill script. Application table queries
  passed and the disposable container was removed. Public readiness remained healthy.
- This closes the local production-backup restoration check only. An offsite
  repository, external alert delivery, new-release migration rehearsal and App
  credential cutover are still outstanding. No patient data was exported to GitHub.

- CI at e59413b: 99 regular tests, 11 real PostgreSQL tests, 13 operations/static
  checks and 17 mocked shell scenarios pass. Lint, audit, migrations and build pass.
- The real restore test uses synthetic CI data, not patient data or an offsite copy.
- Supabase security SQL was hardened and statically checked, but no actual Supabase
  instance was connected or migrated in this work.
- Final browser inspection found a mobile nurse credential button hidden by bottom
  navigation. Added bottom clearance to the route; browser verification is recorded
  in PROJECT_STATUS.md. UI credential responses are mocked, while API authorization
  is separately tested against real PostgreSQL.
- Untracked local .claude/, artifacts/ and debug.log are preserved, not uploaded.
- Hardware long tests and reference-angle validation remain deferred by the user.
  The user has no confirmed offsite store or alert recipient; no service was purchased.

## Next Agent: Release Order

1. Review PR50 independently of the unrelated UI draft PR49. Check the current
   production revision/configuration and make a recoverable backup before migration.
2. Coordinate the breaking credential change: apply the Prisma migration, prepare
   patient/device bindings, issue scoped tokens and update each App. Old shared
   tokens are intentionally rejected. Do not restore global-token access as a workaround.
3. Use dedicated test accounts to validate the complete deployed business workflow,
   including negative cross-patient reads/writes and old-nurse access after transfer.
4. Configure a private encrypted offsite repository and actual notification receiver;
   verify restore and alert delivery without including patient details in alerts.
5. Measure representative workload capacity before expanding users. Cross-process
   notification support alone does not justify multiple replicas or establish capacity.
6. When physical testing is possible, run dual-sensor/network and reference-angle
   protocols, record raw evidence and failures, then decide whether rollout gates pass.

Do not label this branch as deployed, all requirements complete, clinically validated
or ready for mass manufacture until the corresponding evidence exists.
