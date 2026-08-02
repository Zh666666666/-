import { prisma } from "@/lib/prisma";
import { calculateRehabMetrics, type RehabMetrics } from "@/lib/rehab-metrics";
import type { KneeDataPoint, SensorSampleItem } from "@/lib/rehab";
import { readSampleProvenance } from "@/lib/sensor-receipt";

function rawMode(raw: unknown): SensorSampleItem["kneeAngleMode"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const mode = (raw as Record<string, unknown>).kneeAngleMode;
  return mode === "DUAL_SENSOR" || mode === "SINGLE_SENSOR_PROVISIONAL" || mode === "UNKNOWN" ? mode : null;
}

export async function evaluateSensorSession(sessionId: string) {
  const session = await prisma.sensorSession.findUnique({
    where: { id: sessionId },
    include: { patient: true },
  });
  if (!session) return null;

  const [samples, calibration, clinicalRecords] = await Promise.all([
    prisma.sensorSample.findMany({
      where: {
        sessionId,
        patientId: session.patientId,
        placementRevision: session.placementRevision,
        source: "HARDWARE",
      },
      orderBy: { recordedAt: "asc" },
    }),
    prisma.calibrationRecord.findFirst({
      where: { patientId: session.patientId, placementRevision: session.placementRevision },
      orderBy: { createdAt: "desc" },
      select: { quality: true, thighDeviceId: true, shankDeviceId: true },
    }),
    prisma.kneeDataRecord.findMany({
      where: { patientId: session.patientId },
      orderBy: { recordedAt: "desc" },
      take: 12,
    }),
  ]);

  const serialized: SensorSampleItem[] = samples.map((sample) => ({
    id: sample.id,
    ...readSampleProvenance(sample),
    patientId: sample.patientId,
    deviceId: sample.deviceId,
    sessionId: sample.sessionId,
    placement: sample.placement,
    placementRevision: sample.placementRevision,
    source: sample.source,
    recordedAt: sample.recordedAt.toISOString(),
    roll: sample.roll,
    pitch: sample.pitch,
    yaw: sample.yaw,
    ax: sample.ax,
    ay: sample.ay,
    az: sample.az,
    gx: sample.gx,
    gy: sample.gy,
    gz: sample.gz,
    flexionAngle: sample.flexionAngle,
    extensionAngle: sample.extensionAngle,
    confidence: sample.confidence,
    batteryLevel: null,
    signalStrength: null,
    kneeAngleMode: rawMode(sample.raw),
    clinicalEligible: typeof sample.confidence === "number" && sample.confidence >= 0.7,
  }));
  const records: KneeDataPoint[] = clinicalRecords.map((record) => ({
    ...record,
    recordedAt: record.recordedAt.toISOString(),
  })).reverse();
  const now = samples.at(-1)?.recordedAt ?? session.endedAt ?? new Date();
  const metrics = calculateRehabMetrics({
    samples: serialized,
    clinicalRecords: records,
    targetFlexion: session.patient.targetFlexion,
    calibration,
    now,
  });
  return { session, samples: serialized, records, metrics };
}

export function familyStatus(metrics: RehabMetrics) {
  if (!metrics || metrics.dataQuality.synchronizedPairs < 2) return "INSUFFICIENT_DATA";
  if (metrics.warnings.some((warning) => warning.code !== "DATA_STALE" && warning.severity === "HIGH")) return "NEEDS_ATTENTION";
  return metrics.risk.level === "HIGH" || metrics.risk.level === "WATCH" ? "NEEDS_ATTENTION" : "NORMAL";
}

export async function purgeExpiredSensorData(now = new Date()) {
  const rawCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
  const summaryCutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1_000);
  const [raw, sessions, verifications] = await prisma.$transaction([
    prisma.sensorSample.deleteMany({ where: { recordedAt: { lt: rawCutoff } } }),
    prisma.sensorSession.deleteMany({ where: { startedAt: { lt: summaryCutoff }, status: { not: "ACTIVE" } } }),
    prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { rawSamplesDeleted: raw.count, sessionsDeleted: sessions.count, verificationsDeleted: verifications.count };
}

const purgeState = globalThis as typeof globalThis & {
  sensorPurgeLastStartedAt?: number;
  sensorPurgeInFlight?: Promise<unknown>;
};

export function scheduleSensorDataPurge(now = Date.now()) {
  if (purgeState.sensorPurgeInFlight || now - (purgeState.sensorPurgeLastStartedAt ?? 0) < 60 * 60 * 1_000) {
    return;
  }
  purgeState.sensorPurgeLastStartedAt = now;
  purgeState.sensorPurgeInFlight = purgeExpiredSensorData(new Date(now))
    .catch((error) => console.error("Retention cleanup failed", error instanceof Error ? error.message : "unknown error"))
    .finally(() => {
      purgeState.sensorPurgeInFlight = undefined;
    });
}
