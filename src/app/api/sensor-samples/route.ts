import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoAnalyzeAfterSample } from "@/lib/ai-analysis";
import { addDemoSensorSample } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { assessKneeRecord } from "@/lib/rehab";
import { resolveSensorDataSource, sensorDataSources } from "@/lib/sample-provenance";

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

export async function POST(request: Request) {
  const parsed = sensorSampleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor sample payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    const demoResult = addDemoSensorSample(body);
    const analysis = await maybeAutoAnalyzeAfterSample({
      patientId: body.patientId,
      hasKneeRecord: Boolean(demoResult.record),
    });

    return NextResponse.json({
      ...demoResult,
      analysis,
    });
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

  const kneeRecord = typeof body.flexionAngle === "number"
    ? await prisma.kneeDataRecord.create({
        data: {
          patientId: body.patientId,
          flexionAngle: body.flexionAngle,
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

  const assessment = kneeRecord ? assessKneeRecord(kneeRecord) : null;
  const alert = kneeRecord && assessment
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

  const analysis = await maybeAutoAnalyzeAfterSample({
    patientId: body.patientId,
    hasKneeRecord: Boolean(kneeRecord),
  });

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
    analysis,
  });
}
