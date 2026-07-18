import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { addDemoSensorSample, getDemoSensorLiveSnapshot } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { calculateRehabMetrics } from "@/lib/rehab-metrics";
import { assessKneeRecord, type SensorSampleItem } from "@/lib/rehab";
import { resolveSensorDataSource, sensorDataSources } from "@/lib/sample-provenance";
import { publishSensorLiveEvent } from "@/lib/sensor-live-broker";
import {
  buildIngestRaw,
  buildUploadReceipt,
  readSampleProvenance,
  sampleMatchesPayload,
} from "@/lib/sensor-receipt";
import {
  alertCooldownMs,
  clinicalRecordIntervalMs,
  isClinicalKneeAngle,
} from "@/lib/sensor-ingestion";

const sensorSampleSchema = z.object({
  gatewaySampleId: z.string().min(8).max(128).optional(),
  captureSequence: z.coerce.number().int().nonnegative().optional(),
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
  gatewaySampleId: string | null;
  patientId: string;
  deviceId: string | null;
  sessionId: string | null;
  placement: SensorSampleItem["placement"];
  source: SensorSampleItem["source"];
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
  flexionAngle: number | null;
  extensionAngle: number | null;
  confidence: number | null;
  raw: unknown;
}): SensorSampleItem {
  const provenance = readSampleProvenance(sample);
  return {
    id: sample.id,
    ...provenance,
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

function demoSampleMatchesPayload(sample: SensorSampleItem, body: z.infer<typeof sensorSampleSchema>) {
  const numericKeys = ["roll", "pitch", "yaw", "ax", "ay", "az", "gx", "gy", "gz"] as const;
  return sample.gatewaySampleId === (body.gatewaySampleId ?? null)
    && sample.captureSequence === (body.captureSequence ?? null)
    && sample.placement === body.placement
    && sample.recordedAt === (body.recordedAt ?? sample.recordedAt)
    && numericKeys.every((key) => sample[key] === (body[key] ?? null));
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

  const [samples, clinicalRecords, patient] = await Promise.all([
    prisma.sensorSample.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: safeLimit,
    }),
    prisma.kneeDataRecord.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 12,
    }),
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { targetFlexion: true },
    }),
  ]);

  const serialized = samples.map(serializeSensorSample);
  const latestByPlacement = {
    THIGH: serialized.find((sample) => sample.placement === "THIGH") ?? null,
    SHANK: serialized.find((sample) => sample.placement === "SHANK") ?? null,
    BRACE: serialized.find((sample) => sample.placement === "BRACE") ?? null,
    UNKNOWN: serialized.find((sample) => sample.placement === "UNKNOWN") ?? null,
  };
  const latest = serialized[0] ?? null;
  const dualActive = Boolean(latestByPlacement.THIGH && latestByPlacement.SHANK);
  const serializedClinicalRecords = clinicalRecords.map(serializeKneeRecord).reverse();
  const metrics = calculateRehabMetrics({
    samples: serialized,
    clinicalRecords: serializedClinicalRecords,
    targetFlexion: patient?.targetFlexion,
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
    clinicalRecords: serializedClinicalRecords,
    metrics,
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

  const unauthorized = gatewayUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  if (isDemoMode()) {
    const result = addDemoSensorSample(body);
    const sample = result.sample;
    if (result.duplicate && sample && !demoSampleMatchesPayload(sample, body)) {
      return NextResponse.json(
        { error: "gatewaySampleId was already used for a different sample", code: "SAMPLE_ID_CONFLICT" },
        { status: 409 },
      );
    }
    const receipt = sample ? {
      gatewaySampleId: sample.gatewaySampleId ?? null,
      captureSequence: sample.captureSequence ?? null,
      placement: sample.placement,
      recordedAt: sample.recordedAt,
      receivedAt: sample.receivedAt ?? new Date().toISOString(),
      ingestLatencyMs: sample.ingestLatencyMs ?? null,
      integrity: sample.ingestIntegrity ?? "UNVERIFIED",
      values: {
        roll: sample.roll,
        pitch: sample.pitch,
        yaw: sample.yaw,
        ax: sample.ax,
        ay: sample.ay,
        az: sample.az,
        gx: sample.gx,
        gy: sample.gy,
        gz: sample.gz,
      },
    } : null;
    if (sample) {
      publishSensorLiveEvent({
        patientId: sample.patientId,
        gatewaySampleId: sample.gatewaySampleId ?? null,
        placement: sample.placement,
        receivedAt: receipt!.receivedAt,
      });
    }
    return NextResponse.json({ ...result, receipt });
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
  const ingestRaw = buildIngestRaw(body.raw, body.captureSequence);

  const sampleData: Prisma.SensorSampleCreateManyInput = {
    gatewaySampleId: body.gatewaySampleId ?? null,
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
    raw: ingestRaw as Prisma.InputJsonValue,
  };

  const result = await prisma.$transaction(async (transaction) => {
    const duplicate = Boolean(body.gatewaySampleId) && (
      await transaction.sensorSample.createMany({ data: sampleData, skipDuplicates: true })
    ).count === 0;
    const sample = body.gatewaySampleId
      ? await transaction.sensorSample.findUniqueOrThrow({ where: { gatewaySampleId: body.gatewaySampleId } })
      : await transaction.sensorSample.create({ data: sampleData });

    if (duplicate) {
      return { sample, kneeRecord: null, alert: null, duplicate: true };
    }

    if (body.sessionId) {
      await transaction.sensorSession.update({
        where: { id: body.sessionId },
        data: { sampleCount: { increment: 1 } },
      });
    }

    if (body.deviceId) {
      await transaction.device.update({
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
      ? await transaction.kneeDataRecord.findFirst({
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
      ? await transaction.kneeDataRecord.create({
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
      ? await transaction.alertLog.findFirst({
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
      ? await transaction.alertLog.create({
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

    return { sample, kneeRecord, alert, duplicate: false };
  });

  const { sample, kneeRecord, alert, duplicate } = result;

  if (duplicate && (
    sample.patientId !== body.patientId
    || !sampleMatchesPayload(sample, { ...body, recordedAt })
  )) {
    return NextResponse.json(
      { error: "gatewaySampleId was already used for a different sample", code: "SAMPLE_ID_CONFLICT" },
      { status: 409 },
    );
  }

  const receipt = buildUploadReceipt(sample);
  publishSensorLiveEvent({
    patientId: sample.patientId,
    gatewaySampleId: sample.gatewaySampleId,
    placement: sample.placement,
    receivedAt: receipt.receivedAt,
  });

  return NextResponse.json({
    duplicate,
    receipt,
    sample: {
      id: sample.id,
      gatewaySampleId: sample.gatewaySampleId,
      patientId: sample.patientId,
      deviceId: sample.deviceId,
      sessionId: sample.sessionId,
      placement: sample.placement,
      source: sample.source,
      recordedAt: sample.recordedAt.toISOString(),
      receivedAt: sample.createdAt.toISOString(),
      flexionAngle: sample.flexionAngle,
      confidence: sample.confidence,
    },
    record: kneeRecord ? serializeKneeRecord(kneeRecord) : null,
    alert,
  });
}
