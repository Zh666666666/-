# WT9011DCL-BT50 Mobile BLE Gateway

The selected sensor model is `WT9011DCL-BT50`. It uses Bluetooth 5.0 BLE and
the official WitMotion Android SDK supports this model. The product gateway
therefore runs on a nearby Android phone instead of depending on a Windows
Bluetooth COM port.

Official product documents:

- https://wit-motion.yuque.com/wumwnr/docs/eeb0ridm0cnakfyn
- https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk/android_sdk-quick-start

## Architecture

1. The Android app asks for Bluetooth permissions.
2. The official WitMotion SDK searches for `WT` BLE devices.
3. The user assigns one physical sensor to `THIGH` and one to `SHANK`.
4. SDK record callbacks provide acceleration, angular velocity, and angle keys.
5. The native bridge converts those records to the shared gateway contract.
6. Samples are written to an encrypted local queue before upload.
7. The uploader registers devices, binds placements, starts a hardware session,
   and posts samples to the platform API.
8. The server stores raw samples and creates knee-angle records and alerts.

## Implemented In This Repository

- BLE SDK record normalization in `hardware-gateway/ble-sdk-adapter.ts`
- transport-independent dual-sensor pairing and knee-angle calculation
- persistent JSONL queue reference implementation
- automatic device registration, placement binding, session creation, and
  upload client
- WIT standard frame parser for captured-notification verification
- unit tests for BLE records, binary frames, and offline queue behavior
- native Android gateway shell in `mobile-gateway-android`, with an official SDK
  wrapper, two-device placement assignment, zero-angle commands, encrypted
  append-only offline storage, and platform API uploader
- reproducible Android build scripts, Gradle 8.7 wrapper with distribution
  checksum, a pinned WitSDK commit with restricted-network GitHub API fallback,
  and a verified debug APK build using Android Platform 35 and JDK 17
- Android v0.2 runtime fixes for permission continuation, Bluetooth/location
  readiness, SDK listener cleanup, duplicate connection cleanup, Android 7-safe
  timestamps, sample-rate limiting, periodic offline retries, corrupt-record
  quarantine, and patient-safe queue restoration
- GitHub Actions no-USB validation plus R8 release shrinking and explicit APK
  Signature Scheme v2/v3/v4 signing scripts; v4 is delivered as the required
  `.idsig` sidecar

The JSONL queue is the desktop reference implementation. The Android app should
implement the same `OfflineQueue` contract with encrypted mobile storage.

## Android Work Still Required

- install the compiled debug APK on a physical Android phone and verify runtime
  permission, foreground lifecycle, and screen behavior
- confirm the downloaded official SDK remains compatible with the selected
  WT9011DCL-BT50 firmware
- add a foreground service and reconnect scheduling after physical validation;
  the first version is intentionally foreground-only
- replace the temporary BLE-address gateway identifier with a verified physical
  serial number if the shipped device or official SDK exposes one
- complete real device selection, placement confirmation, calibration, and
  connection-status testing with the purchased sensors

## Physical Verification

When the two devices arrive:

1. Confirm both devices appear in the official WitMotion Android application.
2. Record the actual device names, identifiers, firmware, and output keys.
3. Compare angle values with the official application.
4. Confirm notification payloads before relying on the binary parser.
5. Mount one sensor on the thigh and one on the shank.
6. Perform straight-leg zero calibration.
7. Compare calculated knee flexion with a manual goniometer.
8. Disconnect the network, collect data, reconnect, and verify queue drain.
9. Confirm stored records are marked `HARDWARE`, not `DEMO`.

Do not claim real-hardware validation until these checks have been completed
with the purchased devices.
