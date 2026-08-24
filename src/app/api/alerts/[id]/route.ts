import { NextResponse } from "next/server";

import { resolveDemoAlert } from "@/lib/demo-store";
import { updateOrNull } from "@/lib/api-errors";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";
import { accessiblePatientIds } from "@/lib/access-control";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.role !== "nurse") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (isDemoMode()) {
    const alert = resolveDemoAlert(id);

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json(alert);
  }

  const visible = await prisma.alertLog.findFirst({
    where: { id, ...(access.unrestricted ? {} : { patientId: { in: accessiblePatientIds(access) ?? [] } }) },
    select: { id: true },
  });
  if (!visible) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const alert = await updateOrNull(prisma.alertLog.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  }));

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

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
