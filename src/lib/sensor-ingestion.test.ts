import assert from "node:assert/strict";
import test from "node:test";

import {
  alertCooldownMs,
  clinicalRecordIntervalMs,
  isClinicalKneeAngle,
  minimumClinicalConfidence,
  resolveTrustedClinicalPairAngle,
  shouldMaterializeClinicalRecord,
} from "./sensor-ingestion";

test("requires dual-sensor confidence for clinical knee records", () => {
  assert.equal(isClinicalKneeAngle(0.35), false);
  assert.equal(isClinicalKneeAngle(minimumClinicalConfidence), true);
  assert.equal(isClinicalKneeAngle(0.95), true);
  assert.equal(isClinicalKneeAngle(null), false);
  assert.equal(isClinicalKneeAngle(undefined), false);
});

test("throttles clinical records to one point per interval", () => {
  const startedAt = new Date("2026-07-13T10:00:00.000Z");

  assert.equal(shouldMaterializeClinicalRecord(startedAt, null), true);
  assert.equal(
    shouldMaterializeClinicalRecord(
      new Date(startedAt.getTime() + clinicalRecordIntervalMs - 1),
      startedAt,
    ),
    false,
  );
  assert.equal(
    shouldMaterializeClinicalRecord(
      new Date(startedAt.getTime() + clinicalRecordIntervalMs),
      startedAt,
    ),
    true,
  );
});

test("materializes an angle only from a calibrated synchronized hardware pair", () => {
  const current = {
    source: "HARDWARE",
    placement: "SHANK",
    deviceId: "device-shank",
    recordedAt: "2026-07-22T10:00:00.100Z",
    flexionAngle: 82,
    confidence: 0.92,
    kneeAngleMode: "DUAL_SENSOR",
  };
  const opposite = {
    source: "HARDWARE",
    placement: "THIGH",
    deviceId: "device-thigh",
    recordedAt: "2026-07-22T10:00:00.000Z",
    flexionAngle: 80,
    confidence: 0.9,
    kneeAngleMode: "DUAL_SENSOR",
  };
  const calibration = {
    quality: "GOOD",
    thighDeviceId: "device-thigh",
    shankDeviceId: "device-shank",
  };

  assert.equal(resolveTrustedClinicalPairAngle({ current, opposite, calibration, currentBindingMatches: true }), 81);
  assert.equal(resolveTrustedClinicalPairAngle({ current, opposite: { ...opposite, recordedAt: "2026-07-22T10:00:00.400Z" }, calibration, currentBindingMatches: true }), null);
  assert.equal(resolveTrustedClinicalPairAngle({ current, opposite, calibration: { ...calibration, quality: "FAIR" }, currentBindingMatches: true }), null);
  assert.equal(resolveTrustedClinicalPairAngle({ current, opposite, calibration, currentBindingMatches: false }), null);
});

test("keeps alert cooldown at thirty minutes", () => {
  assert.equal(alertCooldownMs, 30 * 60_000);
});
