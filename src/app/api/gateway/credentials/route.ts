import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessPatient } from "@/lib/access-control";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { hashGatewayToken, newGatewayToken } from "@/lib/gateway-auth";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";

const schema = z.object({
  patientId: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(80),
});
const publicFields = { id: true, label: true, deviceSerials: true, createdAt: true, expiresAt: true, revokedAt: true } as const;
const privateHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  const access = await getDataAccessContext();
  if (!access || !canAccessPatient(access, patientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isDemoMode()) return NextResponse.json([], { headers: privateHeaders });
  return NextResponse.json(await prisma.gatewayCredential.findMany({
    where: { patientId }, select: publicFields, orderBy: { createdAt: "desc" }, take: 30,
  }), { headers: privateHeaders });
}

export async function POST(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "请填写凭据名称和患者。" }, { status: 400 });
  const { patientId, label } = input.data;
  const access = await getDataAccessContext();
  if (!access || !canAccessPatient(access, patientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: "演示环境不签发真实采集凭据。" }, { status: 409 });
  const token = newGatewayToken();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'patient:' + patientId}))`;
    const patient = await tx.patient.findFirst({ where: { id: patientId, ...(access.role === "nurse"
      ? { primaryNurseUserId: access.userId } : { profiles: { some: { userId: access.userId, role: "patient" } } }) } });
    if (!patient) return null;
    const bindings = await tx.deviceBinding.findMany({ where: { patientId, active: true }, include: { device: true } });
    const serials = [...new Set(bindings.filter((binding) => binding.device.ownerPatientId === patientId).map((binding) => binding.device.serialNo))];
    if (!serials.length) return null;
    if (await tx.gatewayCredential.count({ where: { patientId, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 5) return null;
    const credential = await tx.gatewayCredential.create({ data: {
      tokenHash: hashGatewayToken(token), patientId, deviceSerials: serials, label,
      createdBy: access.userId, expiresAt: new Date(Date.now() + 90 * 86400_000),
    }, select: publicFields });
    await tx.patientAccessAudit.create({ data: {
      patientId, userId: access.userId, actorUserId: access.userId, actorRole: access.role === "family" ? "patient" : "nurse",
      action: "GATEWAY_ISSUED", details: { credentialId: credential.id, deviceSerials: serials },
    } });
    return credential;
  });
  if (!result) return NextResponse.json({ error: "请先绑定设备；最多保留 5 个有效凭据，请撤销不用的凭据。" }, { status: 409 });
  return NextResponse.json({ ...result, token }, { status: 201, headers: privateHeaders });
}

export async function DELETE(request: Request) {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  const input = z.object({ id: z.string().min(1), patientId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const access = await getDataAccessContext();
  if (!access || !canAccessPatient(access, input.data.patientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { id, patientId } = input.data;
  await prisma.$transaction(async (tx) => {
    const changed = await tx.gatewayCredential.updateMany({ where: { id, patientId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count) await tx.patientAccessAudit.create({ data: {
      patientId, userId: access.userId, actorUserId: access.userId, actorRole: access.role === "family" ? "patient" : "nurse",
      action: "GATEWAY_REVOKED", details: { credentialId: id },
    } });
  });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
