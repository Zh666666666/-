import assert from "node:assert/strict";
import test from "node:test";

import { addDemoSensorSession, getDemoDashboardData, getDemoSensorLiveSnapshot } from "@/lib/demo-store";
import { seedPatients } from "@/lib/rehab";

import { POST } from "./route";

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
    recordedAt: "2026-07-14T00:00:00.000Z",
    flexionAngle: 72,
    extensionAngle: 0,
    confidence: 0.92,
  };
  const initialRecordCount = getDemoDashboardData().records.length;

  const accepted = await (await upload(payload)).json() as { duplicate: boolean; record: { source: string } | null };
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.record?.source, "HARDWARE");
  assert.equal(session.sampleCount, 1);

  const replayed = await (await upload(payload)).json() as { duplicate: boolean; record: unknown };
  assert.equal(replayed.duplicate, true);
  assert.equal(replayed.record, null);
  assert.equal(session.sampleCount, 1);
  assert.equal(getDemoSensorLiveSnapshot(patientId).sampleCount, 1);
  assert.equal(getDemoDashboardData().records.length, initialRecordCount + 1);
});
