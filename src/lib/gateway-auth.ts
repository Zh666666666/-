import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type GatewayGrant = {
  patientId: string;
  deviceSerials: string[];
  expiresAt: Date;
  revokedAt: Date | null;
};

export function hashGatewayToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newGatewayToken() {
  return `tka_gw_${randomBytes(32).toString("base64url")}`;
}

export function grantAllows(grant: GatewayGrant | null, patientId?: string, serialNo?: string, now = new Date()) {
  return Boolean(grant && !grant.revokedAt && grant.expiresAt > now
    && (!patientId || grant.patientId === patientId)
    && (!serialNo || grant.deviceSerials.includes(serialNo)));
}

export async function getGatewayGrant(request: Request): Promise<GatewayGrant | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (tka_gw_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const grant = await prisma.gatewayCredential.findUnique({ where: { tokenHash: hashGatewayToken(token) } });
  return grantAllows(grant) ? grant : null;
}

export async function gatewayUnauthorizedResponse(request: Request, patientId?: string, serialNo?: string) {
  if (isDemoMode()) {
    return null;
  }

  const grant = await getGatewayGrant(request);
  if (!grant) {
    return NextResponse.json(
      { error: "A valid patient-scoped gateway credential is required.", code: "GATEWAY_UNAUTHORIZED" },
      { status: 401 },
    );
  }

  if (!grantAllows(grant, patientId, serialNo)) {
    return NextResponse.json({ error: "Gateway scope denied", code: "GATEWAY_SCOPE_DENIED" }, { status: 403 });
  }

  return null;
}

export async function gatewayDeviceUnauthorizedResponse(request: Request, deviceId: string, patientId?: string) {
  if (isDemoMode()) return null;
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { serialNo: true, ownerPatientId: true } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!device.ownerPatientId || (patientId && patientId !== device.ownerPatientId)) {
    return NextResponse.json({ error: "Device ownership denied" }, { status: 403 });
  }
  return gatewayUnauthorizedResponse(request, device.ownerPatientId, device.serialNo);
}
