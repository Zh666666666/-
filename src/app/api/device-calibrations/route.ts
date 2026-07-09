import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoCalibrationRecord, getDemoCalibrationRecords } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { serializeCalibrationRecord } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const calibrationSchema = z.object({
  patientId: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  thighDeviceId: z.string().optional().nullable(),
  shankDeviceId: z.string().optional().nullable(),
  quality: z.enum(["PENDING", "GOOD", "FAIR", "POOR"]).optional(),
  zeroFlexionAngle: z.coerce.number().min(-30).max(30).optional(),
  baseline: z.unknown().optional(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId");

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(getDemoCalibrationRecords(patientId));
  }

  const records = await prisma.calibrationRecord.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(records.map(serializeCalibrationRecord));
}

export async function POST(request: Request) {
  const parsed = calibrationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid calibration payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(addDemoCalibrationRecord(body));
  }

  await ensureDemoPatients();

  const record = await prisma.calibrationRecord.create({
    data: {
      patientId: body.patientId,
      sessionId: body.sessionId ?? null,
      thighDeviceId: body.thighDeviceId ?? null,
      shankDeviceId: body.shankDeviceId ?? null,
      quality: body.quality ?? "GOOD",
      zeroFlexionAngle: body.zeroFlexionAngle ?? 0,
      baseline: body.baseline == null ? undefined : body.baseline,
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json(serializeCalibrationRecord(record));
}
