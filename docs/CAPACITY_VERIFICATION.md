# Capacity Verification

## Automated ingestion baseline

Run `node --import tsx --test src/app/api/sensor-samples/batch/capacity.integration.test.ts`
after migrating a disposable local database. Set only `PATIENT_TEST_DATABASE_URL`
to a loopback PostgreSQL database named `tka_patient_test` (or with an alphanumeric
suffix). The test never falls back to the production database URL. CI provisions
this database automatically and runs the test on pull requests.

The fixture uses four patients, eight synthetic devices, four scoped credentials
and active sessions. Four clients concurrently upload 80-frame batches, then each
replays its batch. Assertions cover all 640 receipts, exactly 320 persisted samples,
unchanged session counts on replay, patient isolation and conflicting-ID rejection.
Synthetic provisional frames must not create clinical records or alerts. Fixtures
are removed in `finally`; no real credentials or patient records are required.

Output includes batch p50/p95, elapsed time and unique samples per second including
replay processing. This is a bounded route/database regression baseline, not a
capacity certification. Handlers are invoked in-process, without HTTP middleware,
TLS, BLE, mobile storage, web rendering or a calibrated clinical-analysis workload.
No performance threshold is asserted on shared CI hardware.

## Before expanding rollout

Use an isolated, production-sized deployment with synthetic accounts and devices.
Do not run load tests on the live patient server. Agree on expected active patients,
actual per-sensor sample rate, batch cadence and duration first. Include calibrated
dual-sensor computation and authorized concurrent viewers, not just raw ingestion.

Measure sampling-to-visible p50/p95/p99 with synchronized clocks, queue growth and
drain time, failed requests, retries, database pool wait, CPU, memory and storage.
Test sustained load, reconnect, duplicate delivery and historical backfill alongside
fresh samples. Fresh data must not wait behind old uploads. Keep captured and
received timestamps separate. Missing or failed measurements cannot be reported
as a zero-delay result.

The existing product target remains live visibility within two seconds under the
agreed workload. A production capacity number requires that full-path measurement;
the automated test above cannot establish how many actual patients are supported.
