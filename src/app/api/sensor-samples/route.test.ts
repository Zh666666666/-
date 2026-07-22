import assert from "node:assert/strict";
import test from "node:test";

import { addDemoSensorSession, getDemoDashboardData, getDemoSensorLiveSnapshot } from "@/lib/demo-store";
import { seedPatients, type SensorSampleItem } from "@/lib/rehab";

import { GET, POST } from "./route";

function resetDemoStore() {
  delete (globalThis as { rehabDemoState?: unknown }).rehabDemoState;
}

function upload(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/sensor-samples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("accepts a queued hardware upload exactly once", async () => {
  resetDemoStore();
  const patientId = seedPatients[0].id;
  const session = addDemoSensorSession({ patientId, source: "HARDWARE" });
  const payload = {
    gatewaySampleId: "gateway-sample-replay-001",
    patientId,
    sessionId: session.id,
    source: "HARDWARE",
    placement: "SHANK",
    captureSequence: 17,
    recordedAt: "2026-07-14T00:00:00.000Z",
    roll: 1,
    pitch: 2,
    yaw: 3,
    ax: 0.1,
    ay: 0.2,
    az: 1.01,
    gx: 4,
    gy: 5,
    gz: 6,
    flexionAngle: 72,
    extensionAngle: 0,
    confidence: 0.92,
  };
  const initialRecordCount = getDemoDashboardData().records.length;

  const accepted = await (await upload(payload)).json() as {
    duplicate: boolean;
    record: { source: string } | null;
    receipt: { captureSequence: number; integrity: string; values: { az: number } };
  };
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.record, null);
  assert.equal(accepted.receipt.captureSequence, 17);
  assert.equal(accepted.receipt.integrity, "MATCHED");
  assert.equal(accepted.receipt.values.az, 1.01);
  assert.equal(session.sampleCount, 1);

  const replayed = await (await upload(payload)).json() as { duplicate: boolean; record: unknown };
  assert.equal(replayed.duplicate, true);
  assert.equal(replayed.record, null);
  assert.equal(session.sampleCount, 1);
  assert.equal(getDemoSensorLiveSnapshot(patientId).sampleCount, 1);
  assert.equal(getDemoDashboardData().records.length, initialRecordCount);

  const conflicting = await upload({ ...payload, captureSequence: 18 });
  assert.equal(conflicting.status, 409);
});

test("exposes identity and timing provenance on the live snapshot", async () => {
  resetDemoStore();
  const patientId = seedPatients[0].id;
  const recordedAt = new Date(Date.now() - 150).toISOString();
  await upload({
    gatewaySampleId: "provenance-sample-001",
    captureSequence: 3,
    patientId,
    source: "HARDWARE",
    placement: "THIGH",
    recordedAt,
    raw: { protocol: "WIT_BLE_SDK", transport: "BLE_5_NATIVE" },
  });

  const response = await GET(new Request(`http://localhost/api/sensor-samples?patientId=${patientId}`));
  const snapshot = await response.json() as { latest: SensorSampleItem };
  assert.equal(snapshot.latest.gatewaySampleId, "provenance-sample-001");
  assert.equal(snapshot.latest.captureSequence, 3);
  assert.equal(snapshot.latest.ingestIntegrity, "MATCHED");
  assert.equal(snapshot.latest.protocol, "WIT_BLE_SDK");
  assert.ok((snapshot.latest.ingestLatencyMs ?? -1) >= 0);
});

test("returns the explainable rehab metrics contract after eligible dual-sensor uploads", async () => {
  resetDemoStore();
  const patientId = seedPatients[0].id;
  const angles = [5, 25, 70, 95, 65, 8, 30, 75, 100, 60, 20, 7];
  const startedAt = Date.now() - angles.length * 1_000;

  for (let index = 0; index < angles.length; index += 1) {
    for (const [placement, deviceId, offset] of [
      ["THIGH", "demo-device-thigh", 0],
      ["SHANK", "demo-device-shank", 50],
    ] as const) {
      const response = await upload({
        gatewaySampleId: `metrics-contract-${placement.toLowerCase()}-${index}`,
        patientId,
        deviceId,
        source: "HARDWARE",
        placement,
        recordedAt: new Date(startedAt + index * 1_000 + offset).toISOString(),
        flexionAngle: angles[index],
        confidence: 0.92,
        raw: { kneeAngleMode: "DUAL_SENSOR" },
      });
      assert.equal(response.status, 200);
    }
  }

  const response = await GET(new Request(`http://localhost/api/sensor-samples?patientId=${patientId}&limit=60`));
  const snapshot = await response.json() as {
    metrics: {
      clinicalEligible: boolean;
      rom: { value: number | null; formula: string };
      risk: { score: number | null; factors: unknown[] };
      safetyBoundary: string[];
    };
  };

  assert.equal(response.status, 200);
  assert.equal(snapshot.metrics.clinicalEligible, true);
  assert.ok((snapshot.metrics.rom.value ?? 0) > 70);
  assert.match(snapshot.metrics.rom.formula, /P95/);
  assert.equal(typeof snapshot.metrics.risk.score, "number");
  assert.ok(snapshot.metrics.safetyBoundary.length >= 3);
});
