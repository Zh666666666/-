import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoAppointment, getDemoAppointments } from "@/lib/demo-store";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const appointmentSchema = z.object({
  patientName: z.string().min(1),
  patientPhone: z.string().optional().nullable(),
  expectedTime: z.string().datetime(),
  description: z.string().min(1),
});

function serializeAppointment(appointment: {
  id: string;
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
  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(getDemoAppointments());
  }

  const appointments = await prisma.appointment.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(appointments.map(serializeAppointment));
}

export async function POST(request: Request) {
  const parsed = appointmentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    return NextResponse.json(addDemoAppointment(body));
  }

  const appointment = await prisma.appointment.create({
    data: {
      patientName: body.patientName,
      patientPhone: body.patientPhone ?? null,
      expectedTime: new Date(body.expectedTime),
      description: body.description,
    },
  });

  return NextResponse.json(serializeAppointment(appointment));
}
