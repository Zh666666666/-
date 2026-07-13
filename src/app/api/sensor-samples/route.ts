import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoSensorSample, getDemoSensorLiveSnapshot } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { assessKneeRecord, type SensorSampleItem } from "@/lib/rehab";
import { resolveSensorDataSource, sensorDataSources } from "@/lib/sample-provenance";
import {
  alertCooldownMs,
  clinicalRecordIntervalMs,
  isClinicalKneeAngle,
} from "@/lib/sensor-ingestion";

const sensorSampleSchema = z.object({
  sessionId: z.string().optional().nullable(),
  deviceId: z.string().optional().nullable(),
  patientId: z.string().min(1),
  source: z.enum(sensorDataSources).optional(),
  placement: z.enum(["THIGH", "SHANK", "BRACE", "UNKNOWN"]).optional().default("UNKNOWN"),
  recordedAt: z.string().datetime().optional(),
  roll: z.coerce.number().optional().nullable(),
  pitch: z.coerce.number().optional().nullable(),
  yaw: z.coerce.number().optional().nullable(),
  q0: z.coerce.number().optional().nullable(),
  q1: z.coerce.number().optional().nullable(),
  q2: z.coerce.number().optional().nullable(),
  q3: z.coerce.number().optional().nullable(),
  ax: z.coerce.number().optional().nullable(),
  ay: z.coerce.number().optional().nullable(),
  az: z.coerce.number().optional().nullable(),
  gx: z.coerce.number().optional().nullable(),
  gy: z.coerce.number().optional().nullable(),
  gz: z.coerce.number().optional().nullable(),
  flexionAngle: z.coerce.number().min(0).max(150).optional().nullable(),
  extensionAngle: z.coerce.number().min(-20).max(40).optional().nullable(),
  confidence: z.coerce.number().min(0).max(1).optional().nullable(),
  batteryLevel: z.coerce.number().int().min(0).max(100).optional().nullable(),
  signalStrength: z.coerce.number().int().min(0).max(100).optional().nullable(),
  raw: z.unknown().optional(),
});

function serializeKneeRecord(record: {
  id: string;
  patientId: string;
  flexionAngle: number;
  extensionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore: number;
  batteryLevel: number;
  signalStrength: number;
  source: "SMART_BRACE" | "HARDWARE" | "MANUAL" | "DEMO";
  recordedAt: Date;
}) {
  return {
    id: record.id,
    patientId: record.patientId,
    flexionAngle: record.flexionAngle,
    extensionAngle: record.extensionAngle,
    activityFrequency: record.activityFrequency,
    activityDuration: record.activityDuration,
    painScore: record.painScore,
    batteryLevel: record.batteryLevel,
    signalStrength: record.signalStrength,
    source: record.source,
    recordedAt: record.recordedAt.toISOString(),
  };
}

function resolveKneeAngleMode(raw: unknown, confidence: number | null | undefined): SensorSampleItem["kneeAngleMode"] {
  if (raw && typeof raw === "object" && "kneeAngleMode" in raw) {
    const mode = (raw as { kneeAngleMode?: unknown }).kneeAngleMode;
    if (mode === "DUAL_SENSOR" || mode === "SINGLE_SENSOR_PROVISIONAL" || mode === "UNKNOWN") {
      return mode;
    }
  }

  if (typeof confidence === "number") {
    return isClinicalKneeAngle(confidence) ? "DUAL_SENSOR" : "SINGLE_SENSOR_PROVISIONAL";
  }

  return null;
}

function serializeSensorSample(sample: {
  id: string;
  patientId: string;
  deviceId: string | null;
  sessionId: string | null;
  placement: SensorSampleItem["placement"];
  source: SensorSampleItem["source"];
  recordedAt: Date;
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  flexionAngle: number | null;
  extensionAngle: number | null;
  confidence: number | null;
  raw: unknown;
}): SensorSampleItem {
  return {
    id: sample.id,
    patientId: sample.patientId,
    deviceId: sample.deviceId,
    sessionId: sample.sessionId,
    placement: sample.placement,
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
    kneeAngleMode: resolveKneeAngleMode(sample.raw, sample.confidence),
    clinicalEligible: isClinicalKneeAngle(sample.confidence),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId");
  const limit = Number(url.searchParams.get("limit") ?? "40");
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 200)) : 40;

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(getDemoSensorLiveSnapshot(patientId));
  }

  const samples = await prisma.sensorSample.findMany({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
    take: safeLimit,
  });

  const serialized = samples.map(serializeSensorSample);
  const latestByPlacement = {
    THIGH: serialized.find((sample) => sample.placement === "THIGH") ?? null,
    SHANK: serialized.find((sample) => sample.placement === "SHANK") ?? null,
    BRACE: serialized.find((sample) => sample.placement === "BRACE") ?? null,
    UNKNOWN: serialized.find((sample) => sample.placement === "UNKNOWN") ?? null,
  };
  const latest = serialized[0] ?? null;
  const dualActive = Boolean(latestByPlacement.THIGH && latestByPlacement.SHANK);
  const clinicalRecords = await prisma.kneeDataRecord.findMany({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
    take: 12,
  });

  return NextResponse.json({
    patientId,
    updatedAt: latest?.recordedAt ?? new Date().toISOString(),
    sampleCount: serialized.length,
    dualActive,
    mode: latest?.kneeAngleMode ?? (dualActive ? "DUAL_SENSOR" : latest ? "SINGLE_SENSOR_PROVISIONAL" : "UNKNOWN"),
    latest,
    latestByPlacement,
    samples: serialized,
    clinicalRecords: clinicalRecords.map(serializeKneeRecord).reverse(),
  });
}

export async function POST(request: Request) {
  const parsed = sensorSampleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor sample payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoSensorSample(body));
  }

  await ensureDemoPatients();

  const session = body.sessionId
    ? await prisma.sensorSession.findFirst({
        where: { id: body.sessionId, patientId: body.patientId },
        select: { source: true },
      })
    : null;

  if (body.sessionId && !session) {
    return NextResponse.json({ error: "Sensor session was not found for this patient" }, { status: 404 });
  }

  const source = resolveSensorDataSource(session?.source, body.source);

  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();

  const sample = await prisma.sensorSample.create({
    data: {
      sessionId: body.sessionId ?? null,
      deviceId: body.deviceId ?? null,
      patientId: body.patientId,
      source,
      placement: body.placement,
      recordedAt,
      roll: body.roll ?? null,
      pitch: body.pitch ?? null,
      yaw: body.yaw ?? null,
      q0: body.q0 ?? null,
      q1: body.q1 ?? null,
      q2: body.q2 ?? null,
      q3: body.q3 ?? null,
      ax: body.ax ?? null,
      ay: body.ay ?? null,
      az: body.az ?? null,
      gx: body.gx ?? null,
      gy: body.gy ?? null,
      gz: body.gz ?? null,
      flexionAngle: body.flexionAngle ?? null,
      extensionAngle: body.extensionAngle ?? null,
      confidence: body.confidence ?? null,
      raw: body.raw == null ? undefined : body.raw,
    },
  });

  if (body.sessionId) {
    await prisma.sensorSession.update({
      where: { id: body.sessionId },
      data: { sampleCount: { increment: 1 } },
    });
  }

  if (body.deviceId) {
    await prisma.device.update({
      where: { id: body.deviceId },
      data: {
        batteryLevel: body.batteryLevel ?? undefined,
        signalStrength: body.signalStrength ?? undefined,
        lastSeenAt: recordedAt,
        status: typeof body.batteryLevel === "number" && body.batteryLevel <= 20 ? "LOW_BATTERY" : "ONLINE",
      },
    });
  }

  const nearbyClinicalRecord = typeof body.flexionAngle === "number" && isClinicalKneeAngle(body.confidence)
    ? await prisma.kneeDataRecord.findFirst({
        where: {
          patientId: body.patientId,
          source,
          recordedAt: {
            gt: new Date(recordedAt.getTime() - clinicalRecordIntervalMs),
            lt: new Date(recordedAt.getTime() + clinicalRecordIntervalMs),
          },
        },
        select: { id: true },
      })
    : null;

  const shouldCreateKneeRecord = typeof body.flexionAngle === "number"
    && isClinicalKneeAngle(body.confidence)
    && !nearbyClinicalRecord;

  const kneeRecord = shouldCreateKneeRecord
    ? await prisma.kneeDataRecord.create({
        data: {
          patientId: body.patientId,
          flexionAngle: body.flexionAngle!,
          extensionAngle: body.extensionAngle ?? 0,
          activityFrequency: 1,
          activityDuration: 1,
          painScore: 0,
          batteryLevel: body.batteryLevel ?? 92,
          signalStrength: body.signalStrength ?? 96,
          source,
          recordedAt,
        },
      })
    : null;

  const assessment = kneeRecord && kneeRecord.flexionAngle < 78
    ? assessKneeRecord({
        flexionAngle: kneeRecord.flexionAngle,
        activityFrequency: 99,
        activityDuration: 99,
        painScore: 0,
      })
    : null;
  const recentDuplicateAlert = kneeRecord && assessment
    ? await prisma.alertLog.findFirst({
        where: {
          patientId: kneeRecord.patientId,
          type: assessment.type,
          status: { not: "RESOLVED" },
          createdAt: { gte: new Date(Date.now() - alertCooldownMs) },
        },
        select: { id: true },
      })
    : null;
  const alert = kneeRecord && assessment && !recentDuplicateAlert
    ? await prisma.alertLog.create({
        data: {
          patientId: kneeRecord.patientId,
          type: assessment.type,
          severity: assessment.severity,
          title: assessment.title,
          message: assessment.message,
          metric: assessment.metric,
          value: assessment.value,
          threshold: assessment.threshold,
        },
      })
    : null;

  return NextResponse.json({
    sample: {
      id: sample.id,
      patientId: sample.patientId,
      deviceId: sample.deviceId,
      sessionId: sample.sessionId,
      placement: sample.placement,
      source: sample.source,
      recordedAt: sample.recordedAt.toISOString(),
      flexionAngle: sample.flexionAngle,
      confidence: sample.confidence,
    },
    record: kneeRecord ? serializeKneeRecord(kneeRecord) : null,
    alert,
  });
}
