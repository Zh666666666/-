import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoKneeRecord } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { assessKneeRecord } from "@/lib/rehab";

const kneeRecordSchema = z.object({
  patientId: z.string().min(1),
  flexionAngle: z.coerce.number().min(0).max(150),
  extensionAngle: z.coerce.number().min(-20).max(40).optional(),
  activityFrequency: z.coerce.number().int().min(0).max(300),
  activityDuration: z.coerce.number().int().min(0).max(1440),
  painScore: z.coerce.number().int().min(0).max(10).optional(),
  batteryLevel: z.coerce.number().int().min(0).max(100).optional(),
  signalStrength: z.coerce.number().int().min(0).max(100).optional(),
  source: z.enum(["SMART_BRACE", "HARDWARE", "MANUAL", "DEMO"]).optional(),
  recordedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const parsed = kneeRecordSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid knee record payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoKneeRecord(body));
  }

  const record = await prisma.kneeDataRecord.create({
    data: {
      patientId: body.patientId,
      flexionAngle: body.flexionAngle,
      extensionAngle: body.extensionAngle ?? 0,
      activityFrequency: body.activityFrequency,
      activityDuration: body.activityDuration,
      painScore: body.painScore ?? 0,
      batteryLevel: body.batteryLevel ?? null,
      signalStrength: body.signalStrength ?? 96,
      source: body.source ?? "SMART_BRACE",
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    },
  });

  const alert = assessKneeRecord(record);

  const alertLog = alert
    ? await prisma.alertLog.create({
        data: {
          patientId: record.patientId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
        },
      })
    : null;

  return NextResponse.json({
    record: {
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
    },
    alert: alertLog
      ? {
          id: alertLog.id,
          patientId: alertLog.patientId,
          type: alertLog.type,
          severity: alertLog.severity,
          status: alertLog.status,
          title: alertLog.title,
          message: alertLog.message,
          metric: alertLog.metric,
          value: alertLog.value,
          threshold: alertLog.threshold,
          createdAt: alertLog.createdAt.toISOString(),
        }
      : null,
  });
}
