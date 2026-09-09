# Care Workflow Verification - 2026-09-09

## Verified in an isolated PostgreSQL database

The patient-access integration suite now covers:

- Email code request and verification, family-only registration despite a supplied
  nurse role, consumed-code rejection, personal patient creation and nurse invitation.
- Two-nurse/two-family record visibility, profile propagation and ownership races.
- Only the assigned nurse can create guidance; its author comes from the signed-in
  nurse profile, not the submitted name.
- The family sees guidance, confirms reading, and the nurse sees the receipt.
  Nurses cannot impersonate family acknowledgement. Repeat confirmations preserve
  the first read timestamp; another family cannot confirm the record.
- Family appointment request, assigned-nurse confirmation and family-visible result.
  A family cannot approve appointments; another nurse cannot access them. The
  responder's name comes from their stored profile.
- Assigned-nurse alert resolution and family-visible resolved state.
- Completed session history visible to the owning family and assigned nurse only.

Run the existing `src/app/api/patient-access/route.integration.test.ts` with a
migrated, disposable `PATIENT_TEST_DATABASE_URL`. It refuses non-loopback hosts and
non-test database names. CI provisions and runs this automatically.

Email sending is intercepted only at the external provider HTTP boundary. The real
code generation, hash, database registration and binding handlers run normally.
This does not verify delivery to an actual inbox. History and alert fixtures are
synthetic; this test is not a sensor/algorithm accuracy test.

## Browser verification

`scripts/test-care-ui.py` exercises the local demo app at 390px and 1280px using
separate nurse/family browser contexts. It sends guidance through the actual page,
confirms it from the family page, checks persistence after reload and verifies the
nurse's dashboard response. It also injects failed read confirmations and failed
dashboard loads, checks the error messages, and recovers through the retry button.
Both viewports passed without uncaught page errors or family-page horizontal overflow.

Requires Python Playwright with Chromium installed. Start a local demo server on
port 3012 with APP_MODE=demo and AUTH_MODE=demo, then run
`python scripts/test-care-ui.py`. CARE_UI_URL may select another loopback HTTP
address; the script verifies demo readiness before modifying synthetic state.
PLAYWRIGHT_CHROMIUM_EXECUTABLE optionally selects an installed Chromium binary.
Screenshots go to the local, untracked artifacts/care-workflow directory.

Demo cookies and demo storage intentionally do not prove production authorization.
That is covered by the separate real database integration suite. Full browser
registration/password recovery, every history detail screen, real inbox delivery
and post-deployment acceptance remain outstanding.

## Fixes

- Family-only, idempotent read acknowledgement.
- Trusted nurse names for guidance and appointment responses.
- Explicit loading/failure/retry states instead of treating a failed guidance fetch
  as an empty list. Failed read acknowledgement is not reported as success.
- Production polling label no longer incorrectly says Demo.

No production deployment, credential rotation or live patient mutation was performed.
