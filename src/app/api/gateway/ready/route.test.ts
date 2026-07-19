import assert from "node:assert/strict";
import test from "node:test";

import { seedPatients } from "@/lib/rehab";

import { GET } from "./route";

function withDemoMode<T>(callback: () => T) {
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "demo";
  try {
    return callback();
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
}

test("requires the exact patient id during gateway preflight", async () => {
  const missing = await withDemoMode(() => GET(new Request("http://localhost/api/gateway/ready")));
  assert.equal(missing.status, 400);

  const unknown = await withDemoMode(() => GET(new Request("http://localhost/api/gateway/ready?patientId=unknown")));
  assert.equal(unknown.status, 404);
});

test("confirms gateway and patient readiness together", async () => {
  const patient = seedPatients[0];
  const response = await withDemoMode(() => GET(new Request(`http://localhost/api/gateway/ready?patientId=${patient.id}`)));
  const payload = await response.json() as { status: string; gatewayAuthenticated: boolean; patient: { id: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ready");
  assert.equal(payload.gatewayAuthenticated, true);
  assert.equal(payload.patient.id, patient.id);
});
