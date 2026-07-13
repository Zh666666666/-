import { NextResponse } from "next/server";
import { z } from "zod";

import { finishDemoSensorSession } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { serializeSensorSession } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const sessionUpdateSchema = z.object({
  status: z.enum(["COMPLETED", "ABORTED"]).optional().default("COMPLETED"),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = sessionUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor session update", issues: parsed.error.flatten() }, { status: 400 });
  }

  const status = parsed.data.status;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const session = finishDemoSensorSession(id, status);
    return session ? NextResponse.json(session) : NextResponse.json({ error: "Sensor session not found" }, { status: 404 });
  }

  const session = await prisma.sensorSession.update({
    where: { id },
    data: {
      status,
      endedAt: new Date(),
    },
  });

  return NextResponse.json(serializeSensorSession(session));
}
