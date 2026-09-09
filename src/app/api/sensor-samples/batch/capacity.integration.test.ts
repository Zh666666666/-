import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { configureTestEnvironment } from "../../patient-access/test-support";

// Only the disposable CI database is allowed, never the normal application URL.
const databaseUrl = process.env.PATIENT_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/tka_patient_test(?:_[a-zA-Z0-9]+)?$/);
  assert.equal(url.search, "");
  configureTestEnvironment(databaseUrl);
}

test("concurrent synthetic dual-device batches preserve receipts, ownership and replay counts", {
  skip: !databaseUrl && "Requires a migrated disposable PATIENT_TEST_DATABASE_URL",
  timeout: 120_000,
}, async (t) => {
  const { prisma } = await import("@/lib/prisma");
  const { newGatewayToken, hashGatewayToken } = await import("@/lib/gateway-auth");
  const { POST } = await import("./route");
  const prefix = `capacity-${randomUUID()}`;
  const patientIds: string[] = [];
  const deviceIds: string[] = [];
  const durations: number[] = [];
  const request = (token: string, samples: unknown[]) => new Request("http://localhost/api/sensor-samples/batch", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ samples }),
  });
  try {
    const fixtures = [];
    for (let index = 0; index < 4; index += 1) {
      const patient = await prisma.patient.create({ data: {
        medicalRecordNo: `${prefix}-${index}`, name: "Synthetic capacity fixture", age: 60,
        surgeryDate: new Date("2026-01-01"),
      } });
      patientIds.push(patient.id);
      const devices: Array<{ id: string; serialNo: string }> = [];
      for (const placement of ["THIGH", "SHANK"] as const) {
        const device = await prisma.device.create({ data: {
          serialNo: `${prefix}-${index}-${placement}`, name: "Synthetic sensor", ownerPatientId: patient.id,
        } });
        deviceIds.push(device.id);
        await prisma.deviceBinding.create({ data: { patientId: patient.id, deviceId: device.id, placement } });
        devices.push(device);
      }
      const session = await prisma.sensorSession.create({ data: { patientId: patient.id } });
      const token = newGatewayToken();
      await prisma.gatewayCredential.create({ data: {
        tokenHash: hashGatewayToken(token), patientId: patient.id, deviceSerials: devices.map((d) => d.serialNo),
        label: "Synthetic capacity test", createdBy: prefix, expiresAt: new Date(Date.now() + 60_000),
      } });
      const samples = Array.from({ length: 80 }, (_, n) => ({
        patientId: patient.id, sessionId: session.id, deviceId: devices[n % 2].id,
        gatewaySampleId: `${prefix}-${index}-${n}`, captureSequence: Math.floor(n / 2),
        placement: n % 2 === 0 ? "THIGH" : "SHANK", placementRevision: 0,
        recordedAt: new Date(Date.now() - 60_000 + Math.floor(n / 2) * 20).toISOString(),
        roll: n / 10, pitch: 10, yaw: 0, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0,
        confidence: 0.35, raw: { syntheticCapacityTest: true, kneeAngleMode: "SINGLE_SENSOR_PROVISIONAL" },
      }));
      fixtures.push({ patient, session, token, samples });
    }
    const started = performance.now();
    // Concurrent clients, each replaying exactly the same IDs while other clients upload.
    await Promise.all(fixtures.map(async ({ token, samples }) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const before = performance.now();
        const response = await POST(request(token, samples));
        durations.push(performance.now() - before);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.accepted, samples.length);
        assert.equal(body.results.length, samples.length);
        for (let n = 0; n < samples.length; n += 1) {
          const result = body.results[n];
          assert.ok(result.status >= 200 && result.status < 300);
          assert.equal(result.body.duplicate, attempt === 1);
          assert.equal(result.body.receipt.gatewaySampleId, samples[n].gatewaySampleId);
          assert.equal(result.body.receipt.captureSequence, samples[n].captureSequence);
          assert.equal(result.body.receipt.values.roll, samples[n].roll);
          assert.equal(result.body.sample.patientId, samples[n].patientId);
        }
      }
    }));
    const elapsedMs = performance.now() - started;
    for (const fixture of fixtures) {
      assert.equal(await prisma.sensorSample.count({ where: { patientId: fixture.patient.id } }), 80);
      assert.equal((await prisma.sensorSession.findUniqueOrThrow({ where: { id: fixture.session.id } })).sampleCount, 80);
      const denied = await (await POST(request(fixtures[(fixtures.indexOf(fixture) + 1) % fixtures.length].token, [fixture.samples[0]]))).json();
      assert.equal(denied.accepted, 0);
      assert.equal(denied.results[0].status, 403);
      const conflict = await (await POST(request(fixture.token, [{ ...fixture.samples[0], roll: 99 }]))).json();
      assert.equal(conflict.results[0].status, 409);
    }
    assert.equal(await prisma.kneeDataRecord.count({ where: { patientId: { in: patientIds } } }), 0);
    assert.equal(await prisma.alertLog.count({ where: { patientId: { in: patientIds } } }), 0);
    durations.sort((a, b) => a - b);
    t.diagnostic(JSON.stringify({ scope: "in-process route + real PostgreSQL, no HTTP/BLE/browser",
      patients: 4, uniqueSamples: 320, replayedSamples: 320, elapsedMs: Math.round(elapsedMs),
      uniqueSamplesPerSecond: Math.round(320_000 / elapsedMs),
      batchP50Ms: Math.round(durations[Math.ceil(durations.length * 0.5) - 1]),
      batchP95Ms: Math.round(durations[Math.ceil(durations.length * 0.95) - 1]) }));
  } finally {
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.device.deleteMany({ where: { id: { in: deviceIds } } });
    await prisma.$disconnect();
  }
});
