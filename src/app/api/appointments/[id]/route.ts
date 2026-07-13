import { NextResponse } from "next/server";
import { z } from "zod";

import { updateDemoAppointment } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const appointmentUpdateSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  nurseName: z.string().optional().nullable(),
  scheduledTime: z.string().datetime().optional().nullable(),
  responseNote: z.string().optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = appointmentUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment update", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const appointment = updateDemoAppointment(id, body);

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json(appointment);
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: body.status,
      nurseName: body.nurseName ?? null,
      scheduledTime: body.scheduledTime ? new Date(body.scheduledTime) : null,
      responseNote: body.responseNote ?? null,
    },
  });

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
