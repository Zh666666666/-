import { NextResponse } from "next/server";
import { z } from "zod";

import { updateDemoAppointment } from "@/lib/demo-store";
import { updateOrNull } from "@/lib/api-errors";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";
import { accessiblePatientIds } from "@/lib/access-control";

const appointmentUpdateSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  nurseName: z.string().optional().nullable(),
  scheduledTime: z.string().datetime().optional().nullable(),
  responseNote: z.string().optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = appointmentUpdateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment update", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.role !== "nurse") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (isDemoMode()) {
    const appointment = updateDemoAppointment(id, body);

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json(appointment);
  }

  const visible = await prisma.appointment.findFirst({
    where: { id, ...(access.unrestricted ? {} : { patientId: { in: accessiblePatientIds(access) ?? [] } }) },
    select: { id: true },
  });
  if (!visible) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const appointment = await updateOrNull(prisma.appointment.update({
    where: { id },
    data: {
      status: body.status,
      nurseName: body.nurseName ?? null,
      scheduledTime: body.scheduledTime ? new Date(body.scheduledTime) : null,
      responseNote: body.responseNote ?? null,
    },
  }));

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: appointment.id,
    patientName: appointment.patientName,
    patientPhone: appointment.patientPhone,
    expectedTime: appointment.expectedTime.toISOString(),
    description: appointment.description,
    status: appointment.status,
    nurseName: appointment.nurseName,
    scheduledTime: appointment.scheduledTime?.toISOString() ?? null,
    responseNote: appointment.responseNote,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  });
}
