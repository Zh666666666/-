import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoSensorSession } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { serializeSensorSession } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const sessionSchema = z.object({
  patientId: z.string().min(1),
  source: z.enum(["SMART_BRACE", "HARDWARE", "MANUAL", "DEMO"]).optional(),
});

export async function POST(request: Request) {
  const parsed = sessionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor session payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoSensorSession(body));
  }

  await ensureDemoPatients();

  const session = await prisma.sensorSession.create({
    data: {
      patientId: body.patientId,
      source: body.source ?? "HARDWARE",
    },
  });

  return NextResponse.json(serializeSensorSession(session));
}
