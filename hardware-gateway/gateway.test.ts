import assert from "node:assert/strict";
import test from "node:test";

import { HardwareGateway } from "./gateway";
import type { OfflineQueue, QueuedSensorSample, SensorAdapter } from "./types";

class MemoryQueue implements OfflineQueue<QueuedSensorSample> {
  constructor(private items: QueuedSensorSample[]) {}
  async append(item: QueuedSensorSample) { this.items.push(item); }
  async peek(limit: number) { return this.items.slice(0, limit); }
  async acknowledge(count: number) { this.items.splice(0, count); }
  async size() { return this.items.length; }
}

const queuedSample: QueuedSensorSample = {
  gatewaySampleId: "gateway-sample-replay-001",
  patientId: "patient-1",
  serialNo: "WT901BLE67",
  placement: "SHANK",
  recordedAt: "2026-07-11T00:00:00.000Z",
  pitch: 42,
  raw: { protocol: "WIT_BLE_SDK", transport: "BLE_5_NATIVE" },
};

test("keeps the same queued sample id until a retry succeeds", async () => {
  const queue = new MemoryQueue([{ ...queuedSample }]);
  const adapter: SensorAdapter = { start: async () => {}, stop: async () => {} };
  let shouldFail = true;
  const uploads: string[] = [];
  const apiClient = {
    provisionDevice: async () => "device-1",
    startSession: async () => "session-1",
    uploadSample: async (sample: QueuedSensorSample) => {
      uploads.push(sample.gatewaySampleId);
      if (shouldFail) throw new Error("network unavailable");
    },
    finishSession: async () => {},
  };
  const gateway = new HardwareGateway({
    patientId: "patient-1",
    adapters: [adapter],
    apiClient: apiClient as never,
    queue,
    flushIntervalMs: 60_000,
  });

  try {
    await gateway.start();
    assert.equal(await queue.size(), 1);
    shouldFail = false;
    await gateway.flush();
    assert.equal(await queue.size(), 0);
    assert.deepEqual(uploads, [queuedSample.gatewaySampleId, queuedSample.gatewaySampleId]);
  } finally {
    await gateway.stop();
  }
});
