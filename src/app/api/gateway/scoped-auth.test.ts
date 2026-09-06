import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { configureTestEnvironment } from "../patient-access/test-support";

configureTestEnvironment();
const unexpected = async (): Promise<unknown> => { throw new Error("Unexpected database call"); };
const db = {
  gatewayCredential: { findUnique: unexpected },
  device: { findUnique: unexpected },
  sensorSession: { findUnique: unexpected },
  patient: { findUnique: unexpected },
  $transaction: unexpected,
  $disconnect: async () => {},
};
Object.assign(globalThis, { prisma: db });

test("all gateway mutations reject cross-patient or cross-device access before writes", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { GET: ready } = await import("./ready/route");
  const { POST: createSession } = await import("../sensor-sessions/route");
  const { PATCH: finishSession } = await import("../sensor-sessions/[id]/route");
  const { POST: device } = await import("../devices/route");
  const { POST: heartbeat } = await import("../devices/heartbeat/route");
  const { POST: sample } = await import("../sensor-samples/route");
  const { POST: batch } = await import("../sensor-samples/batch/route");
  const { POST: binding } = await import("../device-bindings/route");
  const { POST: calibration } = await import("../device-calibrations/route");
  const token = `tka_gw_${"a".repeat(43)}`;
  const request = (path: string, body?: unknown, method = "POST") => new Request(`http://localhost/api/${path}`, {
    method: body === undefined ? "GET" : method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const grant = { patientId: "patient-a", deviceSerials: ["sensor-a"], expiresAt: new Date(Date.now() + 60_000), revokedAt: null };
  mock.method(prisma.gatewayCredential, "findUnique", async () => grant);
  mock.method(prisma.device, "findUnique", async () => ({ serialNo: "sensor-b", ownerPatientId: "patient-b", id: "device-b" }));
  mock.method(prisma.sensorSession, "findUnique", async () => ({ patientId: "patient-b" }));
  const noWrite = mock.method(prisma, "$transaction", async () => { throw new Error("Cross-scope request reached writes"); });
  try {
    assert.equal((await ready(request("gateway/ready?patientId=patient-b"))).status, 403);
    assert.equal((await createSession(request("sensor-sessions", { patientId: "patient-b" }))).status, 403);
    assert.equal((await finishSession(request("sensor-sessions/session-b", {}, "PATCH"), { params: Promise.resolve({ id: "session-b" }) })).status, 403);
    assert.equal((await device(request("devices", { serialNo: "sensor-b", name: "test" }))).status, 403);
    assert.equal((await heartbeat(request("devices/heartbeat", { deviceId: "device-b" }))).status, 403);
    const frame = { patientId: "patient-b", deviceId: "device-b", sessionId: "session-b", placement: "THIGH", pitch: 10 };
    assert.equal((await sample(request("sensor-samples", frame))).status, 403);
    const result = await (await batch(request("sensor-samples/batch", { samples: [frame, frame] }))).json();
    assert.equal(result.accepted, 0);
    assert.deepEqual(result.results.map((item: { status: number }) => item.status), [403, 403]);
    assert.equal((await binding(request("device-bindings", { patientId: "patient-b", deviceId: "device-b", placement: "THIGH" }))).status, 403);
    assert.equal((await calibration(request("device-calibrations", { patientId: "patient-b" }))).status, 403);
    assert.equal(noWrite.mock.callCount(), 0);
  } finally { mock.restoreAll(); await prisma.$disconnect(); }
});

test("revoked credential fails preflight immediately; active one only returns its patient", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { GET } = await import("./ready/route");
  let revokedAt: Date | null = null;
  mock.method(prisma.gatewayCredential, "findUnique", async () => ({ patientId: "patient-a", deviceSerials: ["sensor-a"], expiresAt: new Date(Date.now() + 60_000), revokedAt }));
  mock.method(prisma.patient, "findUnique", async () => ({ id: "patient-a", name: "A", status: "ACTIVE" }));
  const req = () => new Request("http://localhost/api/gateway/ready?patientId=patient-a", { headers: { authorization: `Bearer tka_gw_${"a".repeat(43)}` } });
  try {
    assert.equal((await GET(req())).status, 200);
    revokedAt = new Date();
    assert.equal((await GET(req())).status, 401);
  } finally { mock.restoreAll(); await prisma.$disconnect(); }
});
