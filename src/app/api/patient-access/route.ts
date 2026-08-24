import { NextResponse } from "next/server";

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

export const runtime = "nodejs";

function invitationSecret() {
  return process.env["PATIENT_INVITE_SECRET"] ?? process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
}

function serializePatient(patient: {
  id: string;
  medicalRecordNo: string;
  name: string;
  age: number;
  surgeryDate: Date;
  surgicalSide: "LEFT" | "RIGHT" | "BILATERAL";
  targetFlexion: number;
  status: "ACTIVE" | "OBSERVATION" | "DISCHARGED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}) {
  return { ...patient, surgeryDate: patient.surgeryDate.toISOString() };
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
    const recentAudits = await prisma.patientAccessAudit.findMany({
      where: { userId: access.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return NextResponse.json({
      role: "family",
      linked: Boolean(profile?.patient),
      patient: profile?.patient ? serializePatient(profile.patient) : null,
      recentAudits: recentAudits.map((item) => ({
        id: item.id,
        action: item.action,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  }

  const patientId = new URL(request.url).searchParams.get("patientId")?.trim();
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
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
    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "患者档案不存在。" }, { status: 404 });
    const code = generatePatientInviteCode();
    const codeHash = await hashPatientInviteCode(code, invitationSecret());
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000);
    const invitation = await prisma.$transaction(async (transaction) => {
      const created = await transaction.patientInvitation.create({
        data: { patientId: input.patientId, codeHash, createdByUserId: access.userId, expiresAt },
      });
      await transaction.patientAccessAudit.create({
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
        if (profile.patientId) throw new Error("ALREADY_LINKED");
        const claimed = await transaction.patientInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "ACCEPTED", acceptedByUserId: access.userId, acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("INVITE_CLAIMED");
        const linked = await transaction.profile.updateMany({
          where: { id: profile.id, patientId: null },
          data: { patientId: invitation.patientId },
        });
        if (linked.count !== 1) throw new Error("ALREADY_LINKED");
        await transaction.patientAccessAudit.create({
          data: {
            patientId: invitation.patientId,
            userId: access.userId,
            action: "INVITE_ACCEPTED",
            actorUserId: access.userId,
            actorRole: "patient",
            details: { invitationId: invitation.id, confirmed: true },
          },
        });
        return transaction.patient.findUniqueOrThrow({ where: { id: invitation.patientId } });
      });
      return NextResponse.json({ ok: true, linked: true, patient: serializePatient(patient) });
    } catch (error) {
      if (error instanceof Error && error.message === "ALREADY_LINKED") return NextResponse.json({ error: "请先解除当前档案关联。" }, { status: 409 });
      if (error instanceof Error && error.message === "PROFILE_REQUIRED") return NextResponse.json({ error: "请先完善账号基本资料。" }, { status: 409 });
      if (error instanceof Error && error.message === "INVITE_CLAIMED") return NextResponse.json({ error: "关联码已被使用，请让护士重新生成。" }, { status: 409 });
      throw error;
    }
  }

  if (input.action === "REVOKE_INVITE") {
    if (access.role !== "nurse") return NextResponse.json({ error: "只有护士可以撤销关联码。" }, { status: 403 });
    const revoked = await prisma.$transaction(async (transaction) => {
      const result = await transaction.patientInvitation.updateMany({
        where: { id: input.invitationId, patientId: input.patientId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      if (result.count !== 1) return false;
      await transaction.patientAccessAudit.create({
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

  if (access.role !== "nurse") return NextResponse.json({ error: "只有护士可以撤销其他账号的关联。" }, { status: 403 });
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
