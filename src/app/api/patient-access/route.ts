import { NextResponse } from "next/server";
import type { Patient } from "@prisma/client";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import {
  createMedicalRecordNo,
  generatePatientInviteCode,
  hashPatientInviteCode,
  inviteIsExpired,
  normalizeInviteCode,
  patientAccessActionSchema,
} from "@/lib/patient-access";
import { prisma } from "@/lib/prisma";
import { seedPatients } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";
import { canAccessPatient } from "@/lib/access-control";

export const runtime = "nodejs";

function invitationSecret() {
  return process.env["PATIENT_INVITE_SECRET"] ?? process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
}

function serializePatient(patient: Patient, primaryNurseName: string | null = null) {
  return {
    ...patient,
    dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
    surgeryDate: patient.surgeryDate.toISOString(),
    primaryNurseName,
    updatedAt: patient.updatedAt.toISOString(),
  };
}

function invalidAction() {
  return NextResponse.json({ error: "请求内容不完整，请确认后重试。" }, { status: 400 });
}

export async function GET(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isDemoMode()) {
    if (access.role === "family") {
      return NextResponse.json({ role: "family", linked: true, patient: seedPatients[0], recentAudits: [] });
    }
    const patientId = new URL(request.url).searchParams.get("patientId");
    const patient = seedPatients.find((item) => item.id === patientId) ?? seedPatients[0];
    return NextResponse.json({ role: "nurse", patient, linkedProfiles: [], invitations: [], recentAudits: [] });
  }

  await prisma.patientInvitation.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });

  if (access.role === "family") {
    const profile = await prisma.profile.findUnique({
      where: { userId: access.userId },
      include: { patient: true },
    });
    const [recentAudits, primaryNurse] = await Promise.all([prisma.patientAccessAudit.findMany({
      where: { userId: access.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }), profile?.patient?.primaryNurseUserId
      ? prisma.profile.findUnique({ where: { userId: profile.patient.primaryNurseUserId }, select: { name: true } })
      : Promise.resolve(null)]);
    return NextResponse.json({
      role: "family",
      linked: Boolean(profile?.patient),
      patient: profile?.patient ? serializePatient(profile.patient, primaryNurse?.name ?? null) : null,
      recentAudits: recentAudits.map((item) => ({
        id: item.id,
        action: item.action,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  }

  const patientId = new URL(request.url).searchParams.get("patientId")?.trim();
  if (!patientId) {
    const invitations = await prisma.patientInvitation.findMany({
      where: { createdByUserId: access.userId },
      select: { id: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    return NextResponse.json({ role: "nurse", patient: null, linkedProfiles: [], invitations: invitations.map((item) => ({
      ...item, expiresAt: item.expiresAt.toISOString(), createdAt: item.createdAt.toISOString(), acceptedAt: item.acceptedAt?.toISOString() ?? null,
    })), recentAudits: [] });
  }
  if (!canAccessPatient(access, patientId)) return NextResponse.json({ error: "无权管理这名患者。" }, { status: 403 });
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "患者档案不存在。" }, { status: 404 });

  const [linkedProfiles, invitations, recentAudits] = await Promise.all([
    prisma.profile.findMany({
      where: { patientId, role: "patient" },
      select: { id: true, name: true, relationToPatient: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.patientInvitation.findMany({
      where: { patientId },
      select: { id: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.patientAccessAudit.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return NextResponse.json({
    role: "nurse",
    patient: serializePatient(patient),
    linkedProfiles: linkedProfiles.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
    invitations: invitations.map((item) => ({
      ...item,
      expiresAt: item.expiresAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
      acceptedAt: item.acceptedAt?.toISOString() ?? null,
    })),
    recentAudits: recentAudits.map((item) => ({
      id: item.id,
      action: item.action,
      actorRole: item.actorRole === "patient" ? "family" : "nurse",
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patientAccessActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidAction();
  const input = parsed.data;

  if (isDemoMode()) {
    if (input.action === "CREATE_INVITE" && access.role === "nurse") {
      return NextResponse.json({ ok: true, code: "DEMO-LINK", expiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString() }, { status: 201 });
    }
    return NextResponse.json({ ok: true, demo: true });
  }

  if (input.action === "SELF_CREATE") {
    if (access.role !== "family") return NextResponse.json({ error: "只有家属账号可以自助建档。" }, { status: 403 });
    const surgeryDate = new Date(`${input.surgeryDate}T00:00:00.000Z`);
    if (surgeryDate.getTime() > Date.now()) return NextResponse.json({ error: "手术日期不能晚于今天。" }, { status: 400 });

    try {
      const patient = await prisma.$transaction(async (transaction) => {
        const profile = await transaction.profile.findUnique({ where: { userId: access.userId } });
        if (!profile || profile.role !== "patient") throw new Error("PROFILE_REQUIRED");
        if (profile.patientId) throw new Error("ALREADY_LINKED");
        const created = await transaction.patient.create({
          data: {
            medicalRecordNo: createMedicalRecordNo(),
            name: input.patientName,
            age: input.age,
            surgeryDate,
            surgicalSide: input.surgicalSide,
            riskLevel: "LOW",
          },
        });
        const linked = await transaction.profile.updateMany({
          where: { id: profile.id, patientId: null },
          data: { patientId: created.id, relationToPatient: input.relationToPatient },
        });
        if (linked.count !== 1) throw new Error("ALREADY_LINKED");
        await transaction.patientAccessAudit.create({
          data: {
            patientId: created.id,
            userId: access.userId,
            action: "SELF_CREATED",
            actorUserId: access.userId,
            actorRole: "patient",
            details: { confirmed: true },
          },
        });
        return created;
      });
      return NextResponse.json({ ok: true, linked: true, patient: serializePatient(patient) }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "ALREADY_LINKED") return NextResponse.json({ error: "当前账号已经关联康复档案。" }, { status: 409 });
      if (error instanceof Error && error.message === "PROFILE_REQUIRED") return NextResponse.json({ error: "请先完善账号基本资料。" }, { status: 409 });
      throw error;
    }
  }

  if (input.action === "CREATE_INVITE") {
    if (access.role !== "nurse") return NextResponse.json({ error: "只有护士可以创建关联码。" }, { status: 403 });
    if (input.patientId && !canAccessPatient(access, input.patientId)) return NextResponse.json({ error: "只能为自己负责的患者创建关联码。" }, { status: 403 });
    const code = generatePatientInviteCode();
    const codeHash = await hashPatientInviteCode(code, invitationSecret());
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000);
    const invitation = await prisma.$transaction(async (transaction) => {
      const created = await transaction.patientInvitation.create({
        data: { patientId: input.patientId ?? null, codeHash, createdByUserId: access.userId, expiresAt },
      });
      if (input.patientId) await transaction.patientAccessAudit.create({
        data: {
          patientId: input.patientId,
          userId: "pending-invitation",
          action: "INVITE_CREATED",
          actorUserId: access.userId,
          actorRole: "nurse",
          details: { invitationId: created.id, expiresAt: expiresAt.toISOString() },
        },
      });
      return created;
    });
    return NextResponse.json({ ok: true, invitationId: invitation.id, code, expiresAt: expiresAt.toISOString() }, { status: 201 });
  }

  if (input.action === "ACCEPT_INVITE") {
    if (access.role !== "family") return NextResponse.json({ error: "只有家属账号可以接受关联。" }, { status: 403 });
    if (normalizeInviteCode(input.code).length !== 8) return NextResponse.json({ error: "关联码格式不正确。" }, { status: 400 });
    const codeHash = await hashPatientInviteCode(input.code, invitationSecret());
    const invitation = await prisma.patientInvitation.findUnique({ where: { codeHash } });
    if (!invitation || invitation.status !== "PENDING") return NextResponse.json({ error: "关联码无效或已经使用。" }, { status: 400 });
    if (inviteIsExpired(invitation.expiresAt)) {
      await prisma.patientInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      return NextResponse.json({ error: "关联码已过期，请让护士重新生成。" }, { status: 410 });
    }

    try {
      const patient = await prisma.$transaction(async (transaction) => {
        const profile = await transaction.profile.findUnique({ where: { userId: access.userId } });
        if (!profile || profile.role !== "patient") throw new Error("PROFILE_REQUIRED");
        const patientId = profile.patientId ?? invitation.patientId;
        if (!patientId) throw new Error("PATIENT_REQUIRED");
        if (profile.patientId && invitation.patientId && profile.patientId !== invitation.patientId) throw new Error("DIFFERENT_PATIENT");
        const currentPatient = await transaction.patient.findUniqueOrThrow({ where: { id: patientId } });
        if (currentPatient.primaryNurseUserId && currentPatient.primaryNurseUserId !== invitation.createdByUserId) throw new Error("NURSE_ALREADY_ASSIGNED");
        const claimed = await transaction.patientInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "ACCEPTED", patientId, acceptedByUserId: access.userId, acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("INVITE_CLAIMED");
        if (!profile.patientId) {
          const linked = await transaction.profile.updateMany({ where: { id: profile.id, patientId: null }, data: { patientId } });
          if (linked.count !== 1) throw new Error("ALREADY_LINKED");
        }
        const assigned = await transaction.patient.updateMany({
          where: { id: patientId, OR: [{ primaryNurseUserId: null }, { primaryNurseUserId: invitation.createdByUserId }] },
          data: { primaryNurseUserId: invitation.createdByUserId },
        });
        if (assigned.count !== 1) throw new Error("NURSE_ALREADY_ASSIGNED");
        await transaction.patientAccessAudit.create({
          data: {
            patientId,
            userId: access.userId,
            action: currentPatient.primaryNurseUserId ? "INVITE_ACCEPTED" : "NURSE_ASSIGNED",
            actorUserId: access.userId,
            actorRole: "patient",
            details: { invitationId: invitation.id, nurseUserId: invitation.createdByUserId, confirmed: true },
          },
        });
        return transaction.patient.findUniqueOrThrow({ where: { id: patientId } });
      });
      return NextResponse.json({ ok: true, linked: true, patient: serializePatient(patient) });
    } catch (error) {
      if (error instanceof Error && error.message === "ALREADY_LINKED") return NextResponse.json({ error: "请先解除当前档案关联。" }, { status: 409 });
      if (error instanceof Error && error.message === "PROFILE_REQUIRED") return NextResponse.json({ error: "请先完善账号基本资料。" }, { status: 409 });
      if (error instanceof Error && error.message === "PATIENT_REQUIRED") return NextResponse.json({ error: "请先创建患者档案，再填写护士归属码。" }, { status: 409 });
      if (error instanceof Error && error.message === "DIFFERENT_PATIENT") return NextResponse.json({ error: "这个关联码属于另一份患者档案。" }, { status: 409 });
      if (error instanceof Error && error.message === "NURSE_ALREADY_ASSIGNED") return NextResponse.json({ error: "这名患者已有主管护士，请先由原护士完成移交。" }, { status: 409 });
      if (error instanceof Error && error.message === "INVITE_CLAIMED") return NextResponse.json({ error: "关联码已被使用，请让护士重新生成。" }, { status: 409 });
      throw error;
    }
  }

  if (input.action === "REVOKE_INVITE") {
    if (access.role !== "nurse") return NextResponse.json({ error: "只有护士可以撤销关联码。" }, { status: 403 });
    const revoked = await prisma.$transaction(async (transaction) => {
      const result = await transaction.patientInvitation.updateMany({
        where: { id: input.invitationId, ...(input.patientId ? { patientId: input.patientId } : {}), createdByUserId: access.userId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      if (result.count !== 1) return false;
      if (input.patientId) await transaction.patientAccessAudit.create({
        data: {
          patientId: input.patientId,
          userId: "pending-invitation",
          action: "INVITE_REVOKED",
          actorUserId: access.userId,
          actorRole: "nurse",
          details: { invitationId: input.invitationId, confirmed: true },
        },
      });
      return true;
    });
    return revoked
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "关联码不存在、已使用或已失效。" }, { status: 409 });
  }

  if (input.action === "FAMILY_UNLINK") {
    if (access.role !== "family") return NextResponse.json({ error: "只有家属账号可以解除自己的关联。" }, { status: 403 });
    const profile = await prisma.profile.findUnique({ where: { userId: access.userId } });
    if (!profile?.patientId) return NextResponse.json({ error: "当前账号尚未关联康复档案。" }, { status: 409 });
    const ownedPatient = await prisma.patient.findUnique({ where: { id: profile.patientId }, select: { primaryNurseUserId: true } });
    if (ownedPatient?.primaryNurseUserId) return NextResponse.json({ error: "患者已绑定主管护士，请先由主管护士发起移交。" }, { status: 409 });
    try {
      await prisma.$transaction(async (transaction) => {
        const unlinked = await transaction.profile.updateMany({
          where: { id: profile.id, patientId: profile.patientId },
          data: { patientId: null },
        });
        if (unlinked.count !== 1) throw new Error("LINK_CHANGED");
        await transaction.patientInvitation.updateMany({
          where: { patientId: profile.patientId!, acceptedByUserId: access.userId, status: "ACCEPTED" },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        await transaction.patientAccessAudit.create({
          data: {
            patientId: profile.patientId!,
            userId: access.userId,
            action: "FAMILY_UNLINKED",
            actorUserId: access.userId,
            actorRole: "patient",
            details: { confirmed: true },
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "LINK_CHANGED") return NextResponse.json({ error: "档案关联刚刚发生变化，请刷新后重试。" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, linked: false });
  }

  if (input.action === "NURSE_RELEASE") {
    if (access.role !== "nurse" || !canAccessPatient(access, input.patientId)) {
      return NextResponse.json({ error: "只有当前主管护士可以发起移交。" }, { status: 403 });
    }
    const released = await prisma.$transaction(async (transaction) => {
      const result = await transaction.patient.updateMany({
        where: { id: input.patientId, primaryNurseUserId: access.userId },
        data: { primaryNurseUserId: null },
      });
      if (result.count !== 1) return false;
      await transaction.patientInvitation.updateMany({
        where: { patientId: input.patientId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      await transaction.patientAccessAudit.create({
        data: {
          patientId: input.patientId,
          userId: access.userId,
          action: "NURSE_RELEASED",
          actorUserId: access.userId,
          actorRole: "nurse",
          details: { confirmed: true },
        },
      });
      return true;
    });
    return released ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "患者归属已变化，请刷新后重试。" }, { status: 409 });
  }

  if (access.role !== "nurse") return NextResponse.json({ error: "只有护士可以撤销其他账号的关联。" }, { status: 403 });
  if (!canAccessPatient(access, input.patientId)) return NextResponse.json({ error: "无权管理这名患者。" }, { status: 403 });
  const profile = await prisma.profile.findFirst({
    where: { id: input.profileId, patientId: input.patientId, role: "patient" },
  });
  if (!profile) return NextResponse.json({ error: "未找到有效关联。" }, { status: 404 });
  try {
    await prisma.$transaction(async (transaction) => {
      const unlinked = await transaction.profile.updateMany({
        where: { id: profile.id, patientId: input.patientId },
        data: { patientId: null },
      });
      if (unlinked.count !== 1) throw new Error("LINK_CHANGED");
      await transaction.patientInvitation.updateMany({
        where: { patientId: input.patientId, acceptedByUserId: profile.userId, status: "ACCEPTED" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      await transaction.patientAccessAudit.create({
        data: {
          patientId: input.patientId,
          userId: profile.userId,
          action: "NURSE_REVOKED",
          actorUserId: access.userId,
          actorRole: "nurse",
          details: { profileId: profile.id, confirmed: true },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LINK_CHANGED") return NextResponse.json({ error: "档案关联刚刚发生变化，请刷新后重试。" }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ ok: true, linked: false });
}
