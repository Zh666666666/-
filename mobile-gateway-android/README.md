# TKA Android BLE Gateway

This native Android application is the near-device gateway for two
`WT9011DCL-BT50` sensors. It deliberately owns BLE communication; a server or
Codespace cannot connect to a patient's nearby BLE devices.

## Before building

1. Install Android Studio with Android SDK Platform 35 and JDK 17, or prepare
   those tools under `%LOCALAPPDATA%\tka-rehab-tools`.
2. From this directory, run `powershell -ExecutionPolicy Bypass -File scripts/sync-wit-sdk.ps1`.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1`, or
   open this directory in Android Studio and let Gradle sync.
4. Set a production HTTPS API URL and patient ID in the app before starting a session.

`sync-wit-sdk.ps1` downloads the Android `WitSDK` source module from WitMotion's
official sample repository into `vendor/WitSDK`. That local dependency is ignored
by Git because the upstream repository does not publish a license file. Review
and accept the upstream terms before distributing an APK.

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

The debug application has been compiled successfully on Windows with JDK 17,
Android Platform 35, Gradle 8.7, and the downloaded official WitSDK. The output
is `app/build/outputs/apk/debug/app-debug.apk`. It has not been installed on a
physical Android phone or validated with a sensor yet. Do not call a reading
real hardware data until it arrives through the official SDK callback on a
physical phone.

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
