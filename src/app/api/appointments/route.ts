import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoAppointment, getDemoAppointments } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";

const appointmentSchema = z.object({
  patientName: z.string().min(1).max(80),
  patientPhone: z.string().max(30).optional().nullable(),
  expectedTime: z.string().datetime(),
  description: z.string().min(1).max(2000),
});

function serializeAppointment(appointment: {
  id: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  expectedTime: Date;
  description: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  nurseName: string | null;
  scheduledTime: Date | null;
  responseNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...appointment,
    expectedTime: appointment.expectedTime.toISOString(),
    scheduledTime: appointment.scheduledTime?.toISOString() ?? null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

export async function GET() {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(getDemoAppointments());
  }

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const appointments = await prisma.appointment.findMany({
    where: access.unrestricted ? undefined : { patientId: access.patientId ?? "__none__" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(appointments.map(serializeAppointment));
}

export async function POST(request: Request) {
  const parsed = appointmentSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoAppointment(body));
  }

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.unrestricted && !access.patientId) {
    return NextResponse.json({ error: "This account is not linked to a patient" }, { status: 409 });
  }

  const appointment = await prisma.appointment.create({
    data: {
      patientId: access.unrestricted ? null : access.patientId,
      patientName: body.patientName,
      patientPhone: body.patientPhone ?? null,
      expectedTime: new Date(body.expectedTime),
      description: body.description,
    },
  });

  return NextResponse.json(serializeAppointment(appointment));
}
