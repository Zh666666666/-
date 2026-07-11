# WT9011DCL-BT50 Official Reference And Integration Guide

Last reviewed: 2026-07-11

This document is the repository's working reference for the purchased
`WT9011DCL-BT50` BLE attitude sensor. It condenses the vendor material into
implementation rules, field mappings, command safety boundaries, and a physical
acceptance procedure. Future agents should read this document before changing
the Android gateway, the binary parser, or knee-angle logic.

This is a technical digest, not a copy of the vendor manuals. The authoritative
vendor pages remain linked below for diagrams, product drawings, and any command
that has not been validated against the shipped firmware.

## Source Index

| Subject | Official source | Use in this repository |
| --- | --- | --- |
| Product document index | <https://wit-motion.yuque.com/wumwnr/docs/eeb0ridm0cnakfyn> | Source directory for this hardware family. |
| Product specification | <https://wit-motion.yuque.com/wumwnr/docs/rwiclb> | Physical, electrical, sensor, output-rate, axis, and connection facts. |
| BLE 5.0 protocol | <https://wit-motion.yuque.com/wumwnr/docs/ycui87fgg1mepk1u> | Raw notification frames, register reads, configuration flow, and field scaling. |
| BLE 5.0 quick start | <https://wit-motion.yuque.com/docs/share/0f5f7fbb-e473-46f3-a769-0c678c7f9ce9> | Official mobile/desktop connection flow. |
| Vendor SDK index | <https://wit-motion.yuque.com/wumwnr/ltst03/stpd3x5zp7075l8g> | Official SDK source and sample applications. |
| Software instructions | <https://wit-motion.yuque.com/wumwnr/docs/aag6u4lgud7l1a3f> | Vendor application workflow. |
| BWT901BLECL5.0 product page | <https://wit-motion.yuque.com/wumwnr/docs/kz7gsz> | Cross-check only when the vendor App requires this profile. Do not replace the physical model label without evidence. |

## Hardware Identity And Evidence Rules

### Confirmed facts

- The purchased sensor's case is labelled `WT9011DCL-BT50`.
- A real unit has been discovered and connected in the vendor mobile App on
  2026-07-11. The App displayed live acceleration, angular velocity, Euler-angle
  and attitude data that changed with motion.
- The App connection screen used the `BWT901BLECL5.0` selection profile and the
  discovered advertising name began with `WT901BLE`.

### Do not infer these facts

- The advertised name is not proof of the printed product model.
- A BLE address, an App identifier, or the Android gateway's `BLE-...` value is
  not a manufacturer serial number. The protocol exposes MAC-related registers
  `0x66` through `0x68`, but neither a MAC nor an advertising name should be
  stored as a verified factory serial number without vendor confirmation.
- A successful vendor-App connection proves radio discovery and live output. It
  does not yet prove that the repository Android gateway can connect, that two
  sensors are synchronized, or that a calculated knee angle is clinically valid.

### Project identity policy

- Keep `WT9011DCL-BT50` as the product model in the platform until firmware and
  vendor SDK evidence establish a different model.
- Record the App profile and advertising name in device metadata when the real
  Android gateway is tested.
- Mark samples from the official SDK callback as `HARDWARE`; generated values,
  screenshots, manually entered values, and the hardware simulator must never
  be marked `HARDWARE`.

## Product Specification Relevant To The Gateway

| Area | Vendor specification | Project consequence |
| --- | --- | --- |
| Compute and fusion | Cortex-M4 class processor, gyroscope, accelerometer, magnetometer, dynamic filtering | Prefer vendor attitude output first; preserve raw axes for later reprocessing. |
| BLE | BLE 5.0, stated open-area range 50 m typical / 90 m maximum | Pair near the patient. Do not design around cloud-side Bluetooth access. |
| Accelerometer | +/-16 g, 0.0005 g/LSB at +/-16 g, 1 kHz sampling, 5-256 Hz bandwidth | Store raw `ax/ay/az` and do not assume the internal sampling rate equals BLE delivery rate. |
| Gyroscope | +/-2000 deg/s, 0.061 deg/s/LSB, 1 kHz sampling, 5-256 Hz bandwidth | Store raw `gx/gy/gz`; use it for motion-quality checks rather than direct knee ROM. |
| Magnetometer | +/-2 Gauss, 0.0667 mGauss/LSB | Magnetic values and yaw require environmental calibration. |
| Roll/pitch | X +/-180 deg; Y +/-90 deg; stated tilt accuracy 0.2 deg | Euler angles are usable only after the mounting-axis test and zero calibration. |
| Yaw | Z +/-180 deg; vendor states 9-axis accuracy under non-interference and warns six-axis dynamic yaw can drift | Do not use absolute yaw as the primary knee-flexion signal. |
| Output rate | 0.2-200 Hz, default 10 Hz; vendor notes 50-200 Hz data may be packetized | Start with a recorded 10 Hz baseline, then validate 50 Hz or higher on real hardware before changing the Android limiter. |
| Outputs | 3-axis acceleration, angular velocity, magnetic field, Euler angles, quaternion, optional position/velocity data | The platform contract keeps acceleration, gyro, Euler angles, quaternion-ready fields, battery, signal, and raw payload. |
| Power | 100 mAh battery, vendor states about 30 h working time and about 2 h charge time | Record battery before a clinical session; do not estimate battery from time alone. |
| Temperature | Working -20 C to 60 C; storage -40 C to 85 C | Treat body-adjacent use as a real-world validation condition, not a substitute for product medical certification. |

## Device State And Connection Behavior

The specification describes these states:

1. Powered off / standby.
2. After button press, the device advertises and its indicator flashes while
   waiting for a connection.
3. After roughly one minute without a connection, the indicator can stop
   flashing while the device continues advertising and remains discoverable.
4. After 24 hours without a connection, the device powers off.

When connected, the indicator cadence represents the reported battery bands.
The Android gateway must therefore report a scan timeout as a scan result, not
automatically as a powered-off device.

The documented Type-C interface is for charging. Do not assume a generic serial
data interface through that port without a vendor-supported adapter and a
separate validation.

## BLE Notification Contract

### Default attitude frame

The vendor protocol describes BLE uploads of at most 20 bytes. The normal
attitude payload consists of:

```text
byte 0    0x55                 packet header
byte 1    0x61                 documented default flag
bytes 2-7 AX, AY, AZ           three signed int16 values, little-endian
bytes 8-13 WX, WY, WZ          three signed int16 values, little-endian
bytes 14-19 Roll, Pitch, Yaw   three signed int16 values, little-endian
```

Scaling from the official protocol:

```text
acceleration axis = signedInt16LE / 32768 * 16       // g
angular velocity  = signedInt16LE / 32768 * 2000     // degrees per second
Euler angle       = signedInt16LE / 32768 * 180      // degrees
```

The current Android gateway uses the official SDK's `Acc*`, `As*`, and `Ang*`
keys rather than parsing display strings. A raw notification capture must be
stored alongside the SDK values during the first physical test to prove the
mapping for this firmware.

### Position mode

The protocol documents register `0x96` (`AGPVSEL`) as the output selector:

- `0`: acceleration + angular velocity + angle.
- `1`: position + position velocity + angle.

Position mode does not output acceleration or angular velocity. It is therefore
not appropriate for the first knee-rehabilitation integration; leave it off
unless a separate motion-trajectory requirement is validated.

### Protocol ambiguities to handle safely

The vendor BLE page contains a contradictory note that labels a `0x61` payload
as both the default attitude layout and a position layout. Its printed Y/Z gyro
formula also repeats the X-byte names. Future code must:

1. Treat the field order table, the official SDK callback, and a real captured
   packet as the validation source.
2. Decode each axis from its own signed little-endian pair.
3. Never change production scaling or enable position mode from the ambiguous
   note alone.

## Coordinate System And Knee-Angle Implications

The vendor specifies an East-North-Up coordinate system: left is X, forward is
Y, and up is Z for the positive module orientation. Euler rotations use Z-Y-X
order. Pitch is limited to +/-90 degrees, and the vendor explicitly warns that
Euler axes couple at large rotations.

Consequences for this product:

- Do not calculate knee flexion by blindly subtracting one named Euler axis.
- Mount both sensors with the same printed-axis orientation relative to each
  limb segment.
- Capture a straight-leg reference after mounting. Store the mounting choice,
  selected relative axis, timestamps, and the reference values.
- Compare the calculated flexion with a manual goniometer and the vendor App
  during controlled flexion/extension trials.
- If mounting cannot keep the movement away from Euler singularities, use the
  relative quaternion orientation after it is validated against the vendor SDK.

## Read-Only Registers And Safe Commands

### One-shot register read

The protocol documents this read command:

```text
FF AA 27 XX 00
```

`XX` is the register address. The response is a `0x55 0x71` packet containing a
starting register address plus eight register values. Useful reads include:

| Purpose | Register | Documented command |
| --- | --- | --- |
| Magnetic field | `0x3A` | `FF AA 27 3A 00` |
| Quaternion block | `0x51` | `FF AA 27 51 00` |
| Temperature | `0x40` | `FF AA 27 40 00` |
| Battery | `0x64` | `FF AA 27 64 00` |
| Version | `0x2E` | `FF AA 27 2E 00` |
| MAC-related values | `0x66-0x68` | Read only after confirming the firmware response. |

### Configuration command safety

The vendor protocol states that writable commands require this sequence:

```text
1. Unlock: FF AA 69 88 B5
2. Send the desired setting within 10 seconds
3. Save:   FF AA 00 00 00
```

Configuration can change calibration, rate, output layout, algorithm, bandwidth,
reference angle, installation direction, and BLE name. Do not issue raw write
commands from the production app until each command is reproduced with a spare
or non-clinical device and its persistence is confirmed.

The existing Android app uses the official SDK's `SetAngle0()` call for the
assigned sensor. Keep that SDK path for the initial zero-reference workflow;
do not replace it with a guessed raw command.

### BLE name rule

The vendor documents a `WT` command prefix and notes that the App filters
Bluetooth names starting with `WT`. The real device's advertised name beginning
with `WT901BLE` is therefore compatible with the documented discovery rule. Do
not rename a production device during the first integration session.

## Official App And SDK Workflow

Vendor instructions for Android are: enable phone Bluetooth, open the vendor
App, select the appropriate device profile, discover nearby devices, connect,
then confirm that the dashboard updates. The real device has completed this
basic connection and live-data step.

Repository SDK policy:

- The Android gateway uses the official WitMotion BLE SDK and syncs the vendor
  module through `mobile-gateway-android/scripts/sync-wit-sdk.*`.
- The vendor module is pinned to commit
  `9efaab0fdd6a06dc807bf80402e58aa91b431c6f` from the official BLE sample
  repository. It is intentionally not committed to this public repository.
- Continue to scan `WT*` devices, then validate the discovered name, BLE
  identifier, firmware, SDK fields, and notification rate before allowing a
  patient session to start.
- Do not use the vendor App's charts as application data. They are a comparison
  instrument for physical validation only.

## Required Physical Acceptance Record

Create a non-demo acceptance record for each actual sensor with:

| Item | Required evidence |
| --- | --- |
| Physical model | Case photo showing `WT9011DCL-BT50`. |
| App profile and name | Selected App profile and advertised device name. |
| Firmware/version | Official SDK or documented register read. |
| Identifier | BLE identifier stored as an identifier, not asserted as factory serial. |
| Baseline | Static acceleration, gyro, Euler angles, battery, and timestamp. |
| Axis test | Controlled positive/negative movement around each physical axis. |
| Rate | Measured callback/notification count over a timed interval. |
| Raw capture | At least one original notification and the corresponding SDK values. |
| Zero reference | Straight-leg mounted reference for each sensor. |
| Two-sensor check | Time alignment, thigh/shank placement, flexion comparison, and repeatability. |
| Offline check | Collect while network is off, reconnect, and verify the encrypted queue drains. |

Only after these checks may samples be marked `HARDWARE`. The existing simulator
is intentionally `DEMO` and must remain isolated from this record.

## Integration Checklist For Future Agents

1. Read this document and `docs/HARDWARE_GATEWAY.md`.
2. Do not change the printed model based only on an App selection profile.
3. Keep the Android BLE SDK callback as the production data source.
4. Record and validate raw BLE frames before changing the binary parser.
5. Keep source provenance: `HARDWARE` for verified SDK samples, `DEMO` for
   generated samples, and never infer physical truth from a device name.
6. Use a mounted straight-leg calibration, not a desk calibration, before
   calculating knee flexion.
7. Do not enable displacement mode for knee ROM collection.
8. Do not send calibration, name, algorithm, rate, or orientation writes until
   the specific command is verified on the shipped firmware.
9. Apply pending Prisma migrations with `npm run db:deploy` before production
   upload is enabled.
