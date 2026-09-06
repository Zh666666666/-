import { NextResponse } from "next/server";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { ageFromDateOfBirth, patientRecordSchema } from "@/lib/patient-record";
import { prisma } from "@/lib/prisma";
import { seedPatients, type PatientSummary } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";
import { canAccessPatient } from "@/lib/access-control";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function serializePatient(patient: {
  id: string; medicalRecordNo: string; name: string; age: number; gender: PatientSummary["gender"];
  dateOfBirth: Date | null; ethnicity: string | null; nativePlace: string | null; nationality: string | null;
  maritalStatus: string | null; occupation: string | null; bloodType: string | null; roomNumber: string | null;
  phone: string | null; homeAddress: string | null; emergencyContactName: string | null;
  emergencyContactRelation: string | null; emergencyContactPhone: string | null;
  allergyStatus: PatientSummary["allergyStatus"]; allergyHistory: string | null; pastMedicalHistory: string | null;
  surgicalHistory: string | null; familyMedicalHistory: string | null; medicationHistory: string | null;
  diagnosis: string; surgeryDate: Date; surgicalSide: PatientSummary["surgicalSide"]; targetFlexion: number;
  status: PatientSummary["status"]; riskLevel: PatientSummary["riskLevel"]; primaryNurseUserId: string | null;
  updatedAt: Date;
}): Promise<PatientSummary> {
  const nurse = patient.primaryNurseUserId
    ? await prisma.profile.findUnique({ where: { userId: patient.primaryNurseUserId }, select: { name: true } })
    : null;
  return {
    ...patient,
    dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
    surgeryDate: patient.surgeryDate.toISOString(),
    primaryNurseName: nurse?.name ?? null,
    updatedAt: patient.updatedAt.toISOString(),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!canAccessPatient(access, id)) return NextResponse.json({ error: "无权查看这份患者档案。" }, { status: 403 });
  if (isDemoMode()) {
    const patient = seedPatients.find((patient) => patient.id === id);
    return patient ? NextResponse.json(patient) : NextResponse.json({ error: "患者档案不存在。" }, { status: 404 });
  }
  const patient = await prisma.patient.findFirst({ where: {
    id,
    ...(access.role === "nurse" ? { primaryNurseUserId: access.userId }
      : { profiles: { some: { userId: access.userId, role: "patient" } } }),
  } });
  return patient ? NextResponse.json(await serializePatient(patient)) : NextResponse.json({ error: "患者档案不存在。" }, { status: 404 });
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    return await updatePatient(request, context);
  } catch (error) {
    if ((error instanceof Error && error.message === "ACCESS_CHANGED")
      || (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")) {
      return NextResponse.json({ error: "档案关联刚刚发生变化，请刷新后重试。" }, { status: 409 });
    }
    throw error;
  }
}

async function updatePatient(request: Request, context: RouteContext) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!canAccessPatient(access, id)) return NextResponse.json({ error: "无权修改这份患者档案。" }, { status: 403 });
  const parsed = patientRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "患者资料格式不正确。" }, { status: 400 });
  if (isDemoMode()) {
    const patient = seedPatients.find((patient) => patient.id === id);
    return patient ? NextResponse.json({ ...patient, ...parsed.data, updatedAt: new Date().toISOString() })
      : NextResponse.json({ error: "患者档案不存在。" }, { status: 404 });
  }

  const input = parsed.data;
  const changedFields = Object.keys(input);
  const patient = await prisma.$transaction(async (transaction) => {
    const current = await transaction.patient.findFirst({ where: {
      id,
      ...(access.role === "nurse" ? { primaryNurseUserId: access.userId }
        : { profiles: { some: { userId: access.userId, role: "patient" } } }),
    } });
    if (!current) throw new Error("ACCESS_CHANGED");
    const updated = await transaction.patient.update({
      where: { id },
      data: {
        ...input,
        age: input.dateOfBirth ? ageFromDateOfBirth(input.dateOfBirth) : undefined,
        dateOfBirth: input.dateOfBirth === undefined ? undefined
          : input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
        surgeryDate: new Date(`${input.surgeryDate}T00:00:00.000Z`),
        allergyHistory: input.allergyStatus === "PRESENT" ? input.allergyHistory ?? null : null,
      },
    });
    await transaction.patientAccessAudit.create({
      data: {
        patientId: id,
        userId: access.userId,
        action: "PATIENT_UPDATED",
        actorUserId: access.userId,
        actorRole: access.role === "family" ? "patient" : "nurse",
        details: { changedFields },
      },
    });
    return updated;
  }, { isolationLevel: "Serializable" });
  return NextResponse.json(await serializePatient(patient));
}
