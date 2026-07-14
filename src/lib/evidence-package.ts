import { z } from "zod";

export const evidenceSampleSchema = z.object({
  id: z.string().min(1),
  recordedAt: z.string().datetime(),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  placement: z.enum(["THIGH", "SHANK"]),
  roll: z.number().finite(),
  pitch: z.number().finite(),
  yaw: z.number().finite(),
  ax: z.number().finite(),
  ay: z.number().finite(),
  az: z.number().finite(),
  gx: z.number().finite(),
  gy: z.number().finite(),
  gz: z.number().finite(),
});

export const evidenceEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  severity: z.enum(["INFO", "WATCH", "HIGH"]),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
  occurredAt: z.string().datetime(),
  title: z.string().min(1),
  evidence: z.string().min(1),
  requiresAction: z.boolean(),
});

export const localEvidencePackageSchema = z.object({
  schemaVersion: z.literal("tka-local-evidence/v1"),
  exportedAt: z.string().datetime(),
  session: z.object({
    id: z.string().min(1),
    subjectId: z.string().min(1),
    status: z.enum(["ACTIVE", "COMPLETED"]),
    source: z.literal("HARDWARE"),
    sensorModel: z.literal("WT9011DCL-BT50"),
    appVersion: z.string().min(1),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    endReason: z.string().min(1),
    sampleCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
  }),
  samples: z.array(evidenceSampleSchema).max(20_000),
  events: z.array(evidenceEventSchema).max(2_000),
}).superRefine((value, context) => {
  if (value.session.status === "COMPLETED" && !value.session.endedAt) {
    context.addIssue({
      code: "custom",
      path: ["session", "endedAt"],
      message: "completed sessions require endedAt",
    });
  }
  if (value.session.sampleCount !== value.samples.length) {
    context.addIssue({
      code: "custom",
      path: ["session", "sampleCount"],
      message: "sampleCount does not match the exported samples",
    });
  }
  if (value.session.eventCount !== value.events.length) {
    context.addIssue({
      code: "custom",
      path: ["session", "eventCount"],
      message: "eventCount does not match the exported events",
    });
  }
  for (let index = 1; index < value.samples.length; index += 1) {
    if (new Date(value.samples[index].recordedAt).getTime() < new Date(value.samples[index - 1].recordedAt).getTime()) {
      context.addIssue({
        code: "custom",
        path: ["samples", index, "recordedAt"],
        message: "samples must be chronological",
      });
      break;
    }
  }
});

export type LocalEvidencePackage = z.infer<typeof localEvidencePackageSchema>;

export type EvidenceReview = {
  eventId: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  note: string;
  updatedAt: string;
};

export type EvidenceSummary = {
  durationSeconds: number;
  sampleCount: number;
  samplingRateHz: number;
  maximumAccelerationG: number;
  maximumAngularVelocityDps: number;
  rollRange: number;
  pitchRange: number;
  yawRange: number;
  actionableEvents: number;
};

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const magnitude = (x: number, y: number, z: number) => Math.sqrt(x ** 2 + y ** 2 + z ** 2);

const range = (values: number[]) => values.length ? Math.max(...values) - Math.min(...values) : 0;

export function parseLocalEvidencePackage(input: unknown): LocalEvidencePackage {
  return localEvidencePackageSchema.parse(input);
}

export function summarizeEvidencePackage(evidence: LocalEvidencePackage): EvidenceSummary {
  const firstSample = evidence.samples.at(0)?.recordedAt;
  const lastSample = evidence.samples.at(-1)?.recordedAt;
  const startedAt = new Date(evidence.session.startedAt).getTime();
  const endedAt = evidence.session.endedAt
    ? new Date(evidence.session.endedAt).getTime()
    : lastSample
      ? new Date(lastSample).getTime()
      : startedAt;
  const sampleSpanMs = firstSample && lastSample
    ? Math.max(0, new Date(lastSample).getTime() - new Date(firstSample).getTime())
    : 0;
  const durationSeconds = Math.max(0, (endedAt - startedAt) / 1000);

  return {
    durationSeconds: round(durationSeconds, 0),
    sampleCount: evidence.samples.length,
    samplingRateHz: sampleSpanMs > 0 ? round((evidence.samples.length - 1) / (sampleSpanMs / 1000), 2) : 0,
    maximumAccelerationG: round(Math.max(0, ...evidence.samples.map((sample) => magnitude(sample.ax, sample.ay, sample.az))), 2),
    maximumAngularVelocityDps: round(Math.max(0, ...evidence.samples.map((sample) => magnitude(sample.gx, sample.gy, sample.gz))), 0),
    rollRange: round(range(evidence.samples.map((sample) => sample.roll))),
    pitchRange: round(range(evidence.samples.map((sample) => sample.pitch))),
    yawRange: round(range(evidence.samples.map((sample) => sample.yaw))),
    actionableEvents: evidence.events.filter((event) => event.requiresAction).length,
  };
}

export function isEvidenceLoopComplete(evidence: LocalEvidencePackage, reviews: Record<string, EvidenceReview>) {
  if (evidence.session.status !== "COMPLETED") return false;
  return evidence.events
    .filter((event) => event.requiresAction)
    .every((event) => reviews[event.id]?.status === "RESOLVED");
}

export function createReviewedEvidenceReport(
  evidence: LocalEvidencePackage,
  reviews: Record<string, EvidenceReview>,
) {
  return {
    schemaVersion: "tka-local-evidence-review/v1" as const,
    generatedAt: new Date().toISOString(),
    sourcePackage: {
      sessionId: evidence.session.id,
      source: evidence.session.source,
      exportedAt: evidence.exportedAt,
    },
    summary: summarizeEvidencePackage(evidence),
    loopComplete: isEvidenceLoopComplete(evidence, reviews),
    eventReviews: evidence.events.map((event) => ({
      eventId: event.id,
      type: event.type,
      title: event.title,
      requiresAction: event.requiresAction,
      status: reviews[event.id]?.status ?? event.status,
      note: reviews[event.id]?.note ?? "",
      updatedAt: reviews[event.id]?.updatedAt ?? null,
    })),
  };
}
