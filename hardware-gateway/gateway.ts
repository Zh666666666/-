import { GatewayApiClient } from "./api-client";
import { randomUUID } from "node:crypto";
import type {
  GatewayPlacement,
  OfflineQueue,
  QueuedSensorSample,
  SensorAdapter,
  SensorReading,
} from "./types";

type HardwareGatewayOptions = {
  patientId: string;
  adapters: SensorAdapter[];
  apiClient: GatewayApiClient;
  queue: OfflineQueue<QueuedSensorSample>;
  sampleIntervalMs?: number;
  flushIntervalMs?: number;
  maxPairSkewMs?: number;
  log?: (message: string) => void;
};

function calculateKneeAngle(thighPitch: number, shankPitch: number) {
  const relative = Math.abs(shankPitch - thighPitch);
  return Math.max(0, Math.min(150, Math.round(relative * 10) / 10));
}

export class HardwareGateway {
  private readonly latest = new Map<GatewayPlacement, SensorReading>();
  private readonly lastQueuedAt = new Map<GatewayPlacement, number>();
  private readonly deviceIds = new Map<string, string>();
  private sessionId: string | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private stopped = true;

  constructor(private readonly options: HardwareGatewayOptions) {}

  async start() {
    this.stopped = false;

    for (const adapter of this.options.adapters) {
      await adapter.start((reading) => this.handleReading(reading));
    }

    this.flushTimer = setInterval(
      () => void this.flush(),
      this.options.flushIntervalMs ?? 1000,
    );
    await this.flush();
  }

  private async handleReading(reading: SensorReading) {
    this.latest.set(reading.placement, reading);
    const recordedAt = new Date(reading.recordedAt).getTime();
    const previous = this.lastQueuedAt.get(reading.placement) ?? 0;

    if (recordedAt - previous < (this.options.sampleIntervalMs ?? 200)) {
      return;
    }

    this.lastQueuedAt.set(reading.placement, recordedAt);
    const queued: QueuedSensorSample = {
      ...reading,
      gatewaySampleId: randomUUID(),
      patientId: this.options.patientId,
    };

    if (reading.placement === "SHANK" && typeof reading.pitch === "number") {
      const thigh = this.latest.get("THIGH");
      const skew = thigh
        ? Math.abs(new Date(thigh.recordedAt).getTime() - recordedAt)
        : Number.POSITIVE_INFINITY;

      if (
        thigh &&
        typeof thigh.pitch === "number" &&
        skew <= (this.options.maxPairSkewMs ?? 300)
      ) {
        queued.flexionAngle = calculateKneeAngle(
          thigh.pitch,
          reading.pitch,
        );
        queued.extensionAngle = Math.max(
          -20,
          Math.min(40, -queued.flexionAngle),
        );
        queued.confidence = Math.max(0.5, 1 - skew / 1000);
      }
    }

    await this.options.queue.append(queued);
  }

  private async ensureDevice(sample: QueuedSensorSample) {
    const existing = this.deviceIds.get(sample.serialNo);
    if (existing) {
      return existing;
    }

    const deviceId = await this.options.apiClient.provisionDevice({
      serialNo: sample.serialNo,
      placement: sample.placement,
      patientId: sample.patientId,
    });
    this.deviceIds.set(sample.serialNo, deviceId);
    return deviceId;
  }

  private async ensureSession() {
    if (!this.sessionId) {
      this.sessionId = await this.options.apiClient.startSession(
        this.options.patientId,
      );
    }
    return this.sessionId;
  }

  async flush() {
    if (this.flushing || this.stopped) {
      return;
    }

    this.flushing = true;
    let uploaded = 0;

    try {
      const samples = await this.options.queue.peek(50);

      for (const sample of samples) {
        const deviceId = await this.ensureDevice(sample);
        const sessionId = await this.ensureSession();
        await this.options.apiClient.uploadSample(
          sample,
          deviceId,
          sessionId,
        );
        uploaded += 1;
      }

      if (uploaded > 0) {
        await this.options.queue.acknowledge(uploaded);
        this.options.log?.(`Uploaded ${uploaded} queued sensor samples.`);
      }
    } catch (error) {
      this.options.log?.(
        `Upload paused; samples remain on disk: ${(error as Error).message}`,
      );
    } finally {
      this.flushing = false;
    }
  }

  async stop(aborted = false) {
    this.stopped = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await Promise.all(this.options.adapters.map((adapter) => adapter.stop()));

    if (this.sessionId) {
      try {
        await this.options.apiClient.finishSession(this.sessionId, aborted);
      } catch (error) {
        this.options.log?.(
          `Could not close remote session: ${(error as Error).message}`,
        );
      }
    }
  }
}
