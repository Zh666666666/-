import assert from "node:assert/strict";
import test from "node:test";

import { addDemoSensorSession, getDemoDashboardData } from "@/lib/demo-store";
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

test("rejects incomplete hardware upload payloads", async () => {
  resetDemoStore();
  assert.equal((await upload({ patientId: "" })).status, 400);
});

test("accepts an offline upload exactly once and preserves its session provenance", async () => {
  resetDemoStore();
  const patientId = seedPatients[0].id;
  const session = addDemoSensorSession({ patientId, source: "DEMO" });
  const payload = {
    gatewaySampleId: "gateway-sample-replay-001",
    patientId,
    sessionId: session.id,
    source: "HARDWARE",
    placement: "SHANK",
    recordedAt: "2026-07-11T00:00:00.000Z",
    flexionAngle: 72,
    extensionAngle: -2,
    confidence: 0.92,
  };
  const initialRecordCount = getDemoDashboardData().records.length;
  const acceptedBody = await (await upload(payload)).json() as { duplicate: boolean; record: { source: string } | null };
  assert.equal(acceptedBody.duplicate, false);
  assert.equal(acceptedBody.record?.source, "DEMO");
  assert.equal(session.sampleCount, 1);

  const replayedBody = await (await upload(payload)).json() as { duplicate: boolean; record: unknown };
  assert.equal(replayedBody.duplicate, true);
  assert.equal(replayedBody.record, null);
  assert.equal(session.sampleCount, 1);
  assert.equal(getDemoDashboardData().records.length, initialRecordCount + 1);
});
