# TKA iOS BLE Gateway

This is the iPhone counterpart to `mobile-gateway-android`. Both apps use the
same platform APIs and sensor sample schema, but BLE transport is implemented
natively for each operating system.

## What is implemented

- SwiftUI operational screen for platform configuration, no-USB readiness, scan,
  two-sensor assignment, angle-zero commands, and collection state.
- Core Bluetooth central implementation with state restoration and the
  `bluetooth-central` background mode.
- WT BLE5 GATT contract currently implemented from the Android integration:
  service `FFE5`, notification `FFE4`, command `FFE9`, and the binary `55 61`
  motion packet parser.
- Keychain-backed AES-GCM encrypted offline queue and HTTPS API uploader.
- Patient-safe device/session caching and thigh/shank angle pairing.
- Swift Package tests and a macOS GitHub Actions build of the iPhone target.

The BLE UUIDs, command bytes, output rate, axes, and physical serial number are
not yet asserted as real-device facts. They must be confirmed on the iPhone 15
Pro with a physical `WT9011DCL-BT50` before any reading is treated as hardware
evidence.

## Open in Xcode

Open `TkaIosGateway.xcodeproj` in Xcode 16 or newer. Select an iPhone running
iOS 17 or newer; the user's iPhone 15 Pro on iOS 26.5.2 is supported by the
deployment target. The app never persists the optional bearer token.

For the first physical check:

1. Enter the HTTPS platform address and a test patient ID.
2. Run the install readiness check.
3. Allow Bluetooth access, then scan in the foreground.
4. Assign one device to `THIGH` and one to `SHANK`.
5. Keep the app in the foreground while confirming notification frames and
   zero calibration; background delivery is intentionally not an acceptance
   substitute for a continuous foreground test.

## TestFlight release prerequisites

TestFlight does not need a USB connection, but it does require an Apple
Developer team, an App Store Connect application record, a distribution
certificate, a provisioning profile, and an authenticated macOS release build.
Those secrets are deliberately not stored in this public repository. Once the
Apple team ID and signing material are available, add a manual signed archive
workflow; do not use a development certificate for a user-facing build.
