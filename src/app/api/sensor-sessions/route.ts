import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoSensorSession } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { isDemoMode } from "@/lib/env";
import { serializeSensorSession } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const sessionSchema = z.object({
  patientId: z.string().min(1),
  source: z.enum(["SMART_BRACE", "HARDWARE", "MANUAL", "DEMO"]).optional(),
  placementRevision: z.coerce.number().int().nonnegative().optional().default(0),
});

export async function POST(request: Request) {
  const parsed = sessionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor session payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const unauthorized = gatewayUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  if (isDemoMode()) {
    return NextResponse.json(addDemoSensorSession(body));
  }

  await ensureDemoPatients();

  const session = await prisma.$transaction(async (transaction) => {
    const bindingCount = await transaction.deviceBinding.count({
      where: {
        patientId: body.patientId,
        placementRevision: body.placementRevision,
        active: true,
        placement: { in: ["THIGH", "SHANK"] },
      },
    });
    if ((body.source ?? "HARDWARE") === "HARDWARE" && bindingCount < 1) {
      throw new Error("PLACEMENT_REVISION_NOT_BOUND");
    }
    await transaction.sensorSession.updateMany({
      where: { patientId: body.patientId, status: "ACTIVE" },
      data: { status: "ABORTED", endedAt: new Date() },
    });
    return transaction.sensorSession.create({
      data: {
        patientId: body.patientId,
        source: body.source ?? "HARDWARE",
        placementRevision: body.placementRevision,
      },
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "PLACEMENT_REVISION_NOT_BOUND") return null;
    throw error;
  });

  if (!session) {
    return NextResponse.json(
      { error: "No active device binding matches placementRevision", code: "PLACEMENT_REVISION_NOT_BOUND" },
      { status: 409 },
    );
  }

  return NextResponse.json(serializeSensorSession(session));
}
