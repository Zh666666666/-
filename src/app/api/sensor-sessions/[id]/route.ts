import { NextResponse } from "next/server";
import { z } from "zod";

import { finishDemoSensorSession } from "@/lib/demo-store";
import { updateOrNull } from "@/lib/api-errors";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { isDemoMode } from "@/lib/env";
import { serializeSensorSession } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";
import { evaluateSensorSession, familyStatus, scheduleSensorDataPurge } from "@/lib/session-evaluation";

const sessionUpdateSchema = z.object({
  status: z.enum(["COMPLETED", "ABORTED"]).optional().default("COMPLETED"),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = sessionUpdateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor session update", issues: parsed.error.flatten() }, { status: 400 });
  }

  const status = parsed.data.status;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const unauthorized = gatewayUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  if (isDemoMode()) {
    const session = finishDemoSensorSession(id, status);
    return session ? NextResponse.json(session) : NextResponse.json({ error: "Sensor session not found" }, { status: 404 });
  }

  const session = await updateOrNull(prisma.sensorSession.update({
    where: { id },
    data: {
      status,
      endedAt: new Date(),
    },
  }));

  if (!session) {
    return NextResponse.json({ error: "Sensor session not found" }, { status: 404 });
  }

  const evaluation = await evaluateSensorSession(session.id);
  const summary = evaluation ? {
    status: familyStatus(evaluation.metrics),
    metrics: evaluation.metrics,
    generatedAt: new Date().toISOString(),
    retention: { rawFramesHours: 72, summaryDays: 15 },
  } : null;
  const finalized = summary
    ? await prisma.sensorSession.update({ where: { id: session.id }, data: { summary } })
    : session;
  scheduleSensorDataPurge();

  if (status === "COMPLETED") {
    const target = new URL("/api/ai-analyses", request.url);
    void fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: request.headers.get("authorization") ?? "",
      },
      body: JSON.stringify({ patientId: session.patientId, sessionId: session.id }),
    }).catch((error) => console.error(
      "Automatic AI analysis failed",
      error instanceof Error ? error.message : "unknown error",
    ));
  }

  return NextResponse.json({ ...serializeSensorSession(finalized), summary });
}
