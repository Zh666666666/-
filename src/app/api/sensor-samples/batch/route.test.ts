import assert from "node:assert/strict";
import test from "node:test";

import { addDemoSensorSession } from "@/lib/demo-store";
import { seedPatients } from "@/lib/rehab";

import { POST } from "./route";

function resetDemoStore() {
  delete (globalThis as { rehabDemoState?: unknown }).rehabDemoState;
}

test("accepts a bounded batch and preserves per-sample receipts", async () => {
  resetDemoStore();
  const patientId = seedPatients[0].id;
  const session = addDemoSensorSession({ patientId, source: "HARDWARE" });
  const response = await POST(new Request("http://localhost/api/sensor-samples/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      samples: ["THIGH", "SHANK"].map((placement, index) => ({
        gatewaySampleId: `batch-sample-${placement.toLowerCase()}-001`,
        captureSequence: index + 1,
        patientId,
        sessionId: session.id,
        source: "HARDWARE",
        placement,
        recordedAt: new Date(Date.now() + index * 20).toISOString(),
        roll: index,
        pitch: 20 + index,
        yaw: 30 + index,
        ax: 0,
        ay: 0,
        az: 1,
        gx: 1,
        gy: 2,
        gz: 3,
      })),
    }),
  }));
  const payload = await response.json() as {
    accepted: number;
    results: Array<{ status: number; body: { receipt: { integrity: string; placement: string } } }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.accepted, 2);
  assert.deepEqual(payload.results.map((result) => result.status), [200, 200]);
  assert.deepEqual(payload.results.map((result) => result.body.receipt.integrity), ["MATCHED", "MATCHED"]);
  assert.deepEqual(payload.results.map((result) => result.body.receipt.placement), ["THIGH", "SHANK"]);
});
