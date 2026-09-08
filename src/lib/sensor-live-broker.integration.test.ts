import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { configureTestEnvironment } from "../app/api/patient-access/test-support";

const url = process.env.PATIENT_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /^\/tka_patient_test(?:_[a-zA-Z0-9]+)?$/);
  assert.equal(parsed.search, "");
  configureTestEnvironment(url);
}

test("PostgreSQL sends and receives live invalidation hints across independent connections", { skip: !url, timeout: 15_000 }, async () => {
  const { publishSensorLiveEvent, subscribeSensorLiveEvents } = await import("./sensor-live-broker");
  const observer = new Client({ connectionString: url });
  await observer.connect();
  await observer.query("LISTEN tka_sensor_live");
  const event = { patientId: "integration-only", gatewaySampleId: "test-not-a-sensor-frame", placement: "THIGH", receivedAt: new Date().toISOString() };
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsub = () => {};
  try {
    const outgoing = new Promise<string>((resolve) => observer.once("notification", (message) => resolve(message.payload!)));
    publishSensorLiveEvent(event);
    assert.deepEqual(JSON.parse(await outgoing).event, event);
    const incoming = new Promise<unknown>((resolve) => {
      unsub = subscribeSensorLiveEvents((received) => { if (received.gatewaySampleId === "remote-hint") resolve(received); });
    });
    const remote = { ...event, gatewaySampleId: "remote-hint" };
    timer = setInterval(() => { void observer.query("SELECT pg_notify('tka_sensor_live', $1)", [JSON.stringify({ origin: "independent-test-client", event: remote })]); }, 100);
    assert.deepEqual(await incoming, remote);
  } finally {
    if (timer) clearInterval(timer);
    unsub();
    await observer.end();
  }
});
