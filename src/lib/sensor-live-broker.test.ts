import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { publishSensorLiveEvent, subscribeSensorLiveEvents, type SensorLiveEvent } from "./sensor-live-broker";

test("live hints coalesce per patient and closed listeners cannot interrupt delivery", async () => {
  const previous = process.env.APP_MODE;
  process.env.APP_MODE = "demo";
  const received: SensorLiveEvent[] = [];
  const bad = subscribeSensorLiveEvents(() => { throw new Error("disconnected"); });
  const good = subscribeSensorLiveEvents((event) => received.push(event));
  try {
    const event = { patientId: "a", gatewaySampleId: "old", placement: "THIGH", receivedAt: new Date().toISOString() };
    publishSensorLiveEvent(event);
    publishSensorLiveEvent({ ...event, gatewaySampleId: "latest" });
    publishSensorLiveEvent({ ...event, patientId: "b" });
    await setTimeout(180);
    assert.deepEqual(received.map((item) => [item.patientId, item.gatewaySampleId]), [["a", "latest"], ["b", "old"]]);
    good(); bad();
    publishSensorLiveEvent(event);
    await setTimeout(180);
    assert.equal(received.length, 2);
  } finally {
    good(); bad();
    if (previous === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previous;
  }
});
