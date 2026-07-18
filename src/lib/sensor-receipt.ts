import type { SensorSampleItem } from "@/lib/rehab";

type RawProvenance = {
  captureSequence?: unknown;
  ingestIntegrity?: unknown;
  protocol?: unknown;
  transport?: unknown;
};

type ReceiptSample = {
  gatewaySampleId: string | null;
  placement: SensorSampleItem["placement"];
  recordedAt: Date;
  createdAt: Date;
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  raw: unknown;
};

const numericKeys = ["roll", "pitch", "yaw", "ax", "ay", "az", "gx", "gy", "gz"] as const;

function asRawProvenance(raw: unknown): RawProvenance {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as RawProvenance : {};
}

export function readSampleProvenance(sample: ReceiptSample) {
  const raw = asRawProvenance(sample.raw);
  const latency = sample.createdAt.getTime() - sample.recordedAt.getTime();

  return {
    gatewaySampleId: sample.gatewaySampleId,
    captureSequence: typeof raw.captureSequence === "number" ? raw.captureSequence : null,
    receivedAt: sample.createdAt.toISOString(),
    ingestLatencyMs: Number.isFinite(latency) ? Math.max(0, latency) : null,
    ingestIntegrity: raw.ingestIntegrity === "MATCHED" ? "MATCHED" as const : "UNVERIFIED" as const,
    protocol: typeof raw.protocol === "string" ? raw.protocol : null,
    transport: typeof raw.transport === "string" ? raw.transport : null,
  };
}

export function buildIngestRaw(raw: unknown, captureSequence: number | undefined) {
  const source = asRawProvenance(raw);
  return {
    ...source,
    captureSequence: captureSequence ?? null,
    ingestIntegrity: "MATCHED",
  };
}

export function sampleMatchesPayload(
  sample: ReceiptSample,
  payload: Partial<Record<(typeof numericKeys)[number], number | null | undefined>> & {
    gatewaySampleId?: string;
    captureSequence?: number;
    placement: SensorSampleItem["placement"];
    recordedAt: Date;
  },
) {
  const provenance = readSampleProvenance(sample);
  if (
    sample.gatewaySampleId !== (payload.gatewaySampleId ?? null)
    || provenance.captureSequence !== (payload.captureSequence ?? null)
    || sample.placement !== payload.placement
    || sample.recordedAt.getTime() !== payload.recordedAt.getTime()
  ) {
    return false;
  }

  return numericKeys.every((key) => {
    const incoming = payload[key] ?? null;
    return sample[key] === incoming;
  });
}

export function buildUploadReceipt(sample: ReceiptSample) {
  const provenance = readSampleProvenance(sample);
  return {
    gatewaySampleId: provenance.gatewaySampleId,
    captureSequence: provenance.captureSequence,
    placement: sample.placement,
    recordedAt: sample.recordedAt.toISOString(),
    receivedAt: provenance.receivedAt,
    ingestLatencyMs: provenance.ingestLatencyMs,
    integrity: provenance.ingestIntegrity,
    values: Object.fromEntries(numericKeys.map((key) => [key, sample[key]])),
  };
}
