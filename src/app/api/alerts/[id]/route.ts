import { NextResponse } from "next/server";

import { resolveDemoAlert } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const alert = resolveDemoAlert(id);

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json(alert);
  }

  const alert = await prisma.alertLog.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: alert.id,
    patientId: alert.patientId,
    type: alert.type,
    severity: alert.severity,
    status: alert.status,
    title: alert.title,
    message: alert.message,
    metric: alert.metric,
    value: alert.value,
    threshold: alert.threshold,
    createdAt: alert.createdAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
  });
}
