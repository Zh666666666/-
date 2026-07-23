import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoCalibrationRecord, getDemoCalibrationRecords } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { serializeCalibrationRecord } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const calibrationSchema = z.object({
  patientId: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  thighDeviceId: z.string().optional().nullable(),
  shankDeviceId: z.string().optional().nullable(),
  placementRevision: z.coerce.number().int().nonnegative().optional().default(0),
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

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
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

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoCalibrationRecord(body));
  }

  await ensureDemoPatients();

  const activeBindings = await prisma.deviceBinding.findMany({
    where: {
      patientId: body.patientId,
      placementRevision: body.placementRevision,
      active: true,
      placement: { in: ["THIGH", "SHANK"] },
    },
    select: { deviceId: true, placement: true },
  });
  const activeThigh = activeBindings.find((binding) => binding.placement === "THIGH")?.deviceId ?? null;
  const activeShank = activeBindings.find((binding) => binding.placement === "SHANK")?.deviceId ?? null;
  if (
    body.quality === "GOOD"
    && (!activeThigh || !activeShank || body.thighDeviceId !== activeThigh || body.shankDeviceId !== activeShank)
  ) {
    return NextResponse.json(
      { error: "Calibration devices do not match the active placement revision", code: "CALIBRATION_BINDING_MISMATCH" },
      { status: 409 },
    );
  }

  const record = await prisma.calibrationRecord.create({
    data: {
      patientId: body.patientId,
      sessionId: body.sessionId ?? null,
      thighDeviceId: body.thighDeviceId ?? null,
      shankDeviceId: body.shankDeviceId ?? null,
      placementRevision: body.placementRevision,
      quality: body.quality ?? "GOOD",
      zeroFlexionAngle: body.zeroFlexionAngle ?? 0,
      baseline: body.baseline == null ? undefined : body.baseline,
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json(serializeCalibrationRecord(record));
}
