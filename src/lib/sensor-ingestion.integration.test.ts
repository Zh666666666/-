import assert from "node:assert/strict";
import test from "node:test";

import { addDemoSensorSample, getDemoDashboardData } from "./demo-store";

const patientId = "demo-patient-1";

function countHardwareState() {
  const dashboard = getDemoDashboardData();
  return {
    records: dashboard.records.filter((record) => record.patientId === patientId && record.source === "HARDWARE").length,
    alerts: dashboard.alerts.filter((alert) => alert.patientId === patientId && alert.status !== "RESOLVED").length,
  };
}

test("a large provisional single-sensor backlog does not create clinical records or alerts", () => {
  const before = countHardwareState();
  const startedAt = Date.parse("2026-07-13T10:00:00.000Z");

  for (let index = 0; index < 781; index += 1) {
    const result = addDemoSensorSample({
      patientId,
      source: "HARDWARE",
      placement: "THIGH",
      recordedAt: new Date(startedAt + index * 500).toISOString(),
      pitch: 45,
      flexionAngle: 45,
      extensionAngle: -20,
      confidence: 0.35,
      raw: { kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL" },
    });

    assert.equal(result.record, null);
    assert.equal(result.alert, null);
  }

  assert.deepEqual(countHardwareState(), before);
});

test("trusted dual-sensor samples are time-throttled and ROM alerts are deduplicated", () => {
  const before = countHardwareState();
  const startedAt = Date.parse("2026-07-13T12:00:00.000Z");
  let createdRecords = 0;
  let createdAlerts = 0;

  for (let index = 0; index < 40; index += 1) {
    const result = addDemoSensorSample({
      patientId,
      source: "HARDWARE",
      placement: "SHANK",
      recordedAt: new Date(startedAt + index * 500).toISOString(),
      flexionAngle: 65,
      extensionAngle: -20,
      confidence: 0.9,
      raw: { kneeAngleMode: "DUAL_SENSOR" },
    });

    if (result.record) createdRecords += 1;
    if (result.alert) createdAlerts += 1;
  }

  assert.equal(createdRecords, 2);
  assert.ok(createdAlerts <= 1);

  const after = countHardwareState();
  assert.equal(after.records - before.records, 2);
  assert.ok(after.alerts - before.alerts <= 1);
});
