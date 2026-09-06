import { NextResponse } from "next/server";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { getDemoDashboardData } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId")?.trim();
  if (!patientId) {
    return NextResponse.json({ error: "patientId is required", code: "PATIENT_ID_REQUIRED" }, { status: 400 });
  }

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const unauthorized = await gatewayUnauthorizedResponse(request, patientId);
  if (unauthorized) return unauthorized;

  const patient = isDemoMode()
    ? getDemoDashboardData().patients.find((item) => item.id === patientId) ?? null
    : await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, name: true, status: true },
      });

  if (!patient) {
    return NextResponse.json(
      { error: "Patient was not found. Copy the patient ID from the web device page.", code: "PATIENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ready",
    gatewayAuthenticated: true,
    patient: {
      id: patient.id,
      name: patient.name,
      status: patient.status,
    },
    checkedAt: new Date().toISOString(),
  });
}
