import { NextResponse } from "next/server";
import { z } from "zod";

import { accessiblePatientIds, canAccessPatient } from "@/lib/access-control";
import { addDemoDevice, getDemoDevices } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { gatewayUnauthorizedResponse, getGatewayGrant } from "@/lib/gateway-auth";
import { normalizeDeviceStatus, serializeDevice } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";

const deviceSchema = z.object({
  patientId: z.string().min(1).max(100).optional(),
  serialNo: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  model: z.string().max(80).optional().default("WT9011DCL-BT50"),
  manufacturer: z.string().max(80).optional().default("WitMotion"),
  firmwareVersion: z.string().max(80).optional().nullable(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId") ?? undefined;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(getDemoDevices(patientId));
  }

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (patientId && !canAccessPatient(access, patientId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const scopedPatientIds = patientId ? [patientId] : accessiblePatientIds(access);

  if (scopedPatientIds) {
    const bindings = await prisma.deviceBinding.findMany({
      where: { patientId: { in: scopedPatientIds }, active: true },
      include: { device: true },
      orderBy: { boundAt: "desc" },
    });

    return NextResponse.json(Array.from(new Map(bindings.map((binding) => [binding.device.id, serializeDevice(binding.device)])).values()));
  }

  const devices = await prisma.device.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(devices.map(serializeDevice));
}

export async function POST(request: Request) {
  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoDevice(body));
  }

  let ownerPatientId = body.patientId;
  if (request.headers.has("authorization")) {
    const forbidden = await gatewayUnauthorizedResponse(request, body.patientId, body.serialNo);
    if (forbidden) return forbidden;
    ownerPatientId = (await getGatewayGrant(request))?.patientId;
  } else {
    const access = await getDataAccessContext();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ownerPatientId || !canAccessPatient(access, ownerPatientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ownerPatientId) return NextResponse.json({ error: "Patient is required" }, { status: 400 });

  const device = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'serial:' + body.serialNo}))`;
    const existing = await transaction.device.findUnique({ where: { serialNo: body.serialNo }, include: { bindings: { where: { active: true } } } });
    if (existing && ((existing.ownerPatientId && existing.ownerPatientId !== ownerPatientId)
      || existing.bindings.some((binding) => binding.patientId !== ownerPatientId))) return null;
    return transaction.device.upsert({
    where: { serialNo: body.serialNo },
    update: {
      ownerPatientId,
      name: body.name,
      model: body.model,
      manufacturer: body.manufacturer,
      firmwareVersion: body.firmwareVersion ?? null,
    },
    create: {
      ownerPatientId,
      serialNo: body.serialNo,
      name: body.name,
      model: body.model,
      manufacturer: body.manufacturer,
      firmwareVersion: body.firmwareVersion ?? null,
      deviceToken: crypto.randomUUID(),
      status: normalizeDeviceStatus({ lastSeenAt: null }),
    },
    });
  });
  if (!device) return NextResponse.json({ error: "Device belongs to another patient", code: "DEVICE_OWNERSHIP_CONFLICT" }, { status: 409 });

  return NextResponse.json(serializeDevice(device));
}
