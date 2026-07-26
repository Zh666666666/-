import assert from "node:assert/strict";
import test from "node:test";

import { calculateRehabMetrics } from "./rehab-metrics";
import type { KneeDataPoint, SensorSampleItem } from "./rehab";

function sample(index: number, angle: number, overrides: Partial<SensorSampleItem> = {}): SensorSampleItem {
  return {
    id: `sample-${index}`,
    patientId: "patient-1",
    deviceId: "device-shank",
    sessionId: "session-1",
    placement: "SHANK",
    source: "HARDWARE",
    recordedAt: new Date(Date.UTC(2026, 6, 14, 10, 0, index)).toISOString(),
    roll: 0,
    pitch: angle,
    yaw: 0,
    ax: 0,
    ay: 0,
    az: 1,
    gx: 0,
    gy: 20,
    gz: 0,
    flexionAngle: angle,
    extensionAngle: 0,
    confidence: 0.9,
    batteryLevel: 80,
    signalStrength: 90,
    kneeAngleMode: "DUAL_SENSOR",
    clinicalEligible: true,
    ...overrides,
  };
}

const goodCalibration = {
  quality: "GOOD" as const,
  thighDeviceId: "device-thigh",
  shankDeviceId: "device-shank",
};

function pairedSamples(angles: number[]) {
  const base = Date.UTC(2026, 6, 14, 10, 0, 0);
  return angles.flatMap((angle, index) => [
    sample(index * 2, angle, {
      placement: "THIGH",
      deviceId: "device-thigh",
      recordedAt: new Date(base + index * 1_000).toISOString(),
    }),
    sample(index * 2 + 1, angle, {
      placement: "SHANK",
      deviceId: "device-shank",
      recordedAt: new Date(base + index * 1_000 + 50).toISOString(),
    }),
  ]);
}

function record(index: number, angle: number, painScore = 2): KneeDataPoint {
  return {
    id: `record-${index}`,
    patientId: "patient-1",
    flexionAngle: angle,
    extensionAngle: 0,
    activityFrequency: 1,
    activityDuration: 1,
    painScore,
    batteryLevel: 80,
    signalStrength: 90,
    source: "MANUAL",
    recordedAt: new Date(Date.UTC(2026, 6, 14, 9, 0, index)).toISOString(),
  };
}

test("calculates robust ROM and completed repetitions from eligible dual-sensor samples", () => {
  const angles = [5, 8, 30, 70, 95, 70, 25, 7, 30, 80, 100, 75, 20, 6];
  const metrics = calculateRehabMetrics({
    samples: pairedSamples(angles),
    clinicalRecords: [],
    targetFlexion: 110,
    calibration: goodCalibration,
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 14)),
  });

  assert.equal(metrics.clinicalEligible, true);
  assert.ok((metrics.rom.value ?? 0) > 80);
  assert.ok((metrics.rom.peakFlexion ?? 0) >= 95);
  assert.equal(metrics.training.repetitions, 2);
  assert.equal(metrics.provenance, "HARDWARE");
});

test("fails closed when only provisional single-sensor angles are present", () => {
  const metrics = calculateRehabMetrics({
    samples: Array.from({ length: 20 }, (_, index) => sample(index, 40 + index, {
      confidence: 0.35,
      kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL",
      clinicalEligible: false,
    })),
    clinicalRecords: [],
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 20)),
  });

  assert.equal(metrics.clinicalEligible, false);
  assert.equal(metrics.rom.value, null);
  assert.equal(metrics.risk.score, null);
  assert.equal(metrics.risk.level, "INSUFFICIENT_DATA");
});

test("keeps an experimental impact warning separate from a single-sensor clinical risk score", () => {
  const samples = Array.from({ length: 8 }, (_, index) => sample(index, 40 + index, {
    confidence: 0.35,
    kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL",
    clinicalEligible: false,
  }));
  const impactBase = Date.UTC(2026, 6, 14, 10, 0, 2);
  samples[2] = { ...samples[2], recordedAt: new Date(impactBase).toISOString(), ax: 0.2, ay: 0.1, az: 0.2, gy: 100 };
  samples[3] = { ...samples[3], recordedAt: new Date(impactBase + 400).toISOString(), ax: 3, ay: 0, az: 0, gy: 120 };
  samples[4] = { ...samples[4], recordedAt: new Date(impactBase + 800).toISOString(), ax: 1, ay: 0, az: 0, gy: 20 };

  const metrics = calculateRehabMetrics({
    samples,
    clinicalRecords: [],
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 8)),
  });

  assert.equal(metrics.clinicalEligible, false);
  assert.equal(metrics.risk.score, null);
  assert.equal(metrics.risk.level, "INSUFFICIENT_DATA");
  assert.ok(metrics.warnings.some((warning) => warning.code === "POSSIBLE_FALL_IMPACT"));
});

test("detects regression, high pain and experimental fall-impact pattern", () => {
  const samples = pairedSamples([5, 20, 55, 90, 60, 20, 5, 25, 65, 95, 55, 15, 5]);
  const impactBase = Date.UTC(2026, 6, 14, 10, 0, 13);
  samples.push(
    sample(100, 0, { placement: "THIGH", deviceId: "device-thigh", recordedAt: new Date(impactBase).toISOString(), ax: 0.2, ay: 0.1, az: 0.2, gy: 100, kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL", clinicalEligible: false }),
    sample(101, 0, { placement: "THIGH", deviceId: "device-thigh", recordedAt: new Date(impactBase + 400).toISOString(), ax: 3, ay: 0, az: 0, gy: 120, kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL", clinicalEligible: false }),
    sample(102, 0, { placement: "THIGH", deviceId: "device-thigh", recordedAt: new Date(impactBase + 800).toISOString(), ax: 1, ay: 0, az: 0, gy: 20, kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL", clinicalEligible: false }),
  );
  const records = [100, 102, 101, 80, 82, 81].map((angle, index) => record(index, angle, index === 5 ? 8 : 2));
  const metrics = calculateRehabMetrics({
    samples,
    clinicalRecords: records,
    calibration: goodCalibration,
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 14)),
  });

  assert.ok(metrics.warnings.some((warning) => warning.code === "ROM_REGRESSION"));
  assert.ok(metrics.warnings.some((warning) => warning.code === "PAIN_HIGH"));
  assert.ok(metrics.warnings.some((warning) => warning.code === "POSSIBLE_FALL_IMPACT"));
  assert.equal(metrics.risk.level, "HIGH");
  assert.ok((metrics.risk.score ?? 0) >= 75);
});

test("requires a matching GOOD calibration and synchronized dual-device pairs", () => {
  const angles = [5, 20, 60, 90, 60, 20, 5, 25, 70, 95, 55, 15, 5];
  const withoutCalibration = calculateRehabMetrics({
    samples: pairedSamples(angles),
    clinicalRecords: [],
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 14)),
  });
  assert.equal(withoutCalibration.clinicalEligible, false);
  assert.equal(withoutCalibration.dataQuality.measurementStatus, "SETUP_REQUIRED");
  assert.ok((withoutCalibration.rom.value ?? 0) > 60);
  assert.equal(withoutCalibration.risk.score, null);

  const unsynchronized = pairedSamples(angles).map((item) => (
    item.placement === "SHANK"
      ? { ...item, recordedAt: new Date(new Date(item.recordedAt).getTime() + 400).toISOString() }
      : item
  ));
  const failedPairing = calculateRehabMetrics({
    samples: unsynchronized,
    clinicalRecords: [],
    calibration: goodCalibration,
    now: new Date(Date.UTC(2026, 6, 14, 10, 0, 14)),
  });
  assert.equal(failedPairing.clinicalEligible, false);
  assert.equal(failedPairing.dataQuality.synchronizedPairs, 0);
  assert.equal(failedPairing.risk.score, null);
});
