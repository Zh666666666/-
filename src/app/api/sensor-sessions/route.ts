import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, isUserRole } from "@/lib/auth";
import { addDemoSensorSession } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { isDemoMode, resolveAuthMode } from "@/lib/env";
import { serializeSensorSession } from "@/lib/hardware";
import { localSessionCookie, verifyLocalSession } from "@/lib/local-auth";
import { prisma } from "@/lib/prisma";
import { purgeExpiredSensorData } from "@/lib/session-evaluation";

const sessionSchema = z.object({
  patientId: z.string().min(1),
  source: z.enum(["SMART_BRACE", "HARDWARE", "MANUAL", "DEMO"]).optional(),
  placementRevision: z.coerce.number().int().nonnegative().optional().default(0),
});

async function currentRole() {
  const store = await cookies();
  if (resolveAuthMode() === "local") {
    return (await verifyLocalSession(
      store.get(localSessionCookie)?.value,
      process.env["LOCAL_AUTH_SESSION_SECRET"],
    ))?.role ?? null;
  }
  const role = store.get(authRoleCookie)?.value;
  return isUserRole(role) ? role : null;
}

export async function GET(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  if (isDemoMode()) return NextResponse.json([]);

  const url = new URL(request.url);
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedPatientId = url.searchParams.get("patientId");
  const familyPatient = role === "family"
    ? await prisma.patient.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
    : null;
  const patientId = role === "family" ? familyPatient?.id ?? "__none__" : requestedPatientId;
  await purgeExpiredSensorData().catch((error) => console.error("Retention cleanup failed", error));
  const sessions = await prisma.sensorSession.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      status: { in: ["COMPLETED", "ABORTED"] },
      startedAt: { gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000) },
    },
    include: {
      patient: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  const analyses = await prisma.aiAnalysis.findMany({
    where: { sessionId: { in: sessions.map((session) => session.id) } },
    orderBy: { createdAt: "desc" },
  });
  const analysisBySession = new Map(analyses.map((analysis) => [analysis.sessionId, analysis]));
  return NextResponse.json(sessions.map((session) => ({
    ...serializeSensorSession(session),
    patientName: session.patient.name,
    summary: session.summary,
    analysis: analysisBySession.get(session.id) ?? null,
  })));
}

export async function POST(request: Request) {
  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));

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
