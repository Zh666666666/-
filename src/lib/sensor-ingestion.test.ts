import assert from "node:assert/strict";
import test from "node:test";

import {
  alertCooldownMs,
  clinicalRecordIntervalMs,
  isClinicalKneeAngle,
  minimumClinicalConfidence,
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

test("keeps alert cooldown at thirty minutes", () => {
  assert.equal(alertCooldownMs, 30 * 60_000);
});
