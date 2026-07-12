# TKA Android BLE Gateway

This native Android application is the near-device gateway for two
`WT9011DCL-BT50` sensors. It deliberately owns BLE communication; a server or
Codespace cannot connect to a patient's nearby BLE devices.

## Before building

1. Install Android Studio with Android SDK Platform 35 and JDK 17, or prepare
   those tools under `%LOCALAPPDATA%\tka-rehab-tools`.
2. From this directory, run `powershell -ExecutionPolicy Bypass -File scripts/sync-wit-sdk.ps1` on Windows or `scripts/sync-wit-sdk.sh` on Linux.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1`, or
   open this directory in Android Studio and let Gradle sync.
4. Set a production HTTPS API URL and patient ID in the app before starting a session.

The sync scripts download the Android `WitSDK` source module from WitMotion's
official sample repository into `vendor/WitSDK`. They pin commit
`9efaab0fdd6a06dc807bf80402e58aa91b431c6f` so a moving upstream branch cannot
silently change a build. The local dependency is ignored by Git because the
upstream repository does not publish a license file. Review and accept the
upstream terms before distributing an APK.

The sync script first tries a shallow Git clone. When direct GitHub clone access
is unavailable, it falls back to the authenticated GitHub API and verifies the
official `DeviceModel.java` file before returning successfully. Use `-ApiOnly`
to skip the Git clone attempt on a restricted network.

## Implemented contract

- Uses official `WitBluetoothManager`, `DeviceManager`, and `DeviceModel` APIs.
- Finds `WT*` devices, assigns a device to `THIGH` or `SHANK`, and connects it.
- Reads official `Acc*`, `As*`, and `Ang*` fields without parsing display text.
- Sends the official `SetAngle0()` zero-reference command for an assigned sensor.
- Writes readings to an encrypted local file before network upload.
- Provisions devices, records active placements, opens a hardware session, and
  posts samples to the platform APIs.
- Continues the first scan after runtime permission approval instead of requiring
  a second tap, and blocks scanning with actionable messages when Bluetooth or
  location services are unavailable.
- Limits SDK callbacks to 10 samples per second per sensor, retries queued
  uploads every 15 seconds, and keeps restored samples bound to their original
  patient ID.
- Keeps the server URL and patient ID between launches while deliberately never
  storing the optional bearer token.

The debug application has been compiled successfully on Windows with JDK 17,
Android Platform 35, Gradle 8.7, and the downloaded official WitSDK. The output
is `app/build/outputs/apk/debug/app-debug.apk`. It has not been installed on a
physical Android phone or validated with a sensor yet. Do not call a reading
real hardware data until it arrives through the official SDK callback on a
physical phone.

## No-USB build and test

The `Android Gateway` GitHub Actions workflow runs JVM tests, Android Lint,
debug/release compilation, R8 shrinking, zip alignment, and APK signature
verification. Its `android-gateway-ci-<commit>` artifact contains an installable
debug APK and a release-shaped APK signed by an ephemeral CI key. The CI-signed
APK is for one-off phone testing only: each workflow run uses a new certificate,
so it cannot upgrade an APK from another run.

Download the artifact directly on the phone, extract it, allow installation from
the browser or file manager for that one install, and install `app-debug.apk`.
The debug package ID is `cn.tkarehab.gateway.debug`, so it can coexist with a
production release.

After installing, tap `运行安装自检`. It reports BLE hardware, Bluetooth, runtime
permissions, location services, encrypted offline queue, and platform
configuration separately. A successful self-check means the phone is ready to
scan; it does not claim that a physical sensor has connected or uploaded data.

## Hardened release signing

Release builds enable R8 code optimization/obfuscation and resource shrinking,
disable backups and cleartext traffic, and are signed after zip alignment by
`scripts/sign-release.sh` or `scripts/sign-release.ps1`. The signing scripts:

- disable legacy v1 signing because the minimum supported system is Android 7.0
  (API 24);
- require and verify APK Signature Scheme v2 and v3 in the APK;
- cryptographically verify the v4 sidecar `TKA-Gateway-v0.2.1.apk.idsig` with
  Android's APK signature library;
- read passwords from environment variables so secrets do not appear in command
  arguments or the public repository.

The manual GitHub Actions release job expects these repository secrets:

- `ANDROID_SIGNING_KEYSTORE_BASE64`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_STORE_PASSWORD`
- `ANDROID_SIGNING_KEY_PASSWORD`

Keep the original keystore outside GitHub as a separately backed-up private file.
Losing it prevents future APKs from upgrading existing installations. If an
older APK used a different certificate, uninstall it before installing this
release or sign with the original keystore.

## Arrival-day verification

1. Confirm both devices are visible in the official WitMotion app.
2. Record actual name, address, firmware, rate, axes, and official SDK values.
3. Assign one sensor to the thigh and one to the shank in this app.
4. Send zero calibration while the leg is straight and both devices are mounted.
5. Compare flexion against a manual goniometer and the official application.
6. Disable the phone network, collect readings, reconnect, and confirm the
   encrypted queue drains into `/api/sensor-samples`.

The current BLE address is only a gateway identifier (`BLE-...`), not an asserted
manufacturer serial number. Replace it with a verified physical serial number if
the shipped device or official SDK exposes one.
