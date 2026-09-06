# Installation Administration

Run these operator-only commands from a trusted full checkout with Node dependencies
and private production environment loaded. They are not public API endpoints.
Never place secrets in command arguments, shell history, screenshots or Git.

`node --import tsx scripts/manage-installation.ts inventory` lists serial/model,
firmware, owner patient ID, last heartbeat and status, without credentials.

`node --import tsx scripts/manage-installation.ts nurses` lists local nurse account
IDs and status. Public registration remains family-only.

For approved nurse onboarding, load `TKA_NURSE_NAME` and `TKA_NURSE_PASSWORD` from
a protected secret source, then run:

```text
node --import tsx scripts/manage-installation.ts create-nurse nurse@example.com confirm:nurse@example.com
node --import tsx scripts/manage-installation.ts disable-nurse ACCOUNT_ID confirm:ACCOUNT_ID
node --import tsx scripts/manage-installation.ts enable-nurse ACCOUNT_ID confirm:ACCOUNT_ID
node --import tsx scripts/manage-installation.ts release-device DEVICE_ID confirm:DEVICE_ID
```

Creating nurses is an administrator identity-verification decision. Passwords use
the same validation/hash as registration. Existing email accounts are never promoted.
Before disabling a nurse, transfer/release all assigned patients using the existing
nurse workflow. Disabling updates the account/session version and revokes issued
gateway credentials and pending invitations. Re-enabling does not restore old tokens.

Device release is ONLY for an operator who has physically recovered and checked the
device. It stops active patient sessions, deactivates bindings, revokes credentials
covering the serial and clears current battery/connectivity state. Historical samples
remain attached to their original patient. No user can forcibly take another patient's
device through the normal binding API. Record operator, time, approval and returned
device inspection in the site's restricted service log; CLI results contain action/ID.

## Version and Hardware Release Gates

Record repository commit, Android APK SHA-256/signing certificate, APK version,
sensor firmware, serials, installation date and assigned operator per shipment.
The inventory endpoint is not a firmware updater. Do not claim BLE serial matching
is cryptographic device attestation: counterfeit/modified clients can spoof serials.
Physical identity and firmware trust require a separate hardware strategy.

Battery measurement, charging safety, endurance, mounting tolerances, firmware
compatibility and lot sampling are factory tests, not checks this software can certify.
Do not mark batch manufacturing ready on the strength of CI alone.
