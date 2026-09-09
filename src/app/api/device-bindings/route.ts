import { NextResponse } from "next/server";
import { z } from "zod";

import { accessiblePatientIds, canAccessPatient } from "@/lib/access-control";
import { addDemoDeviceBinding, getDemoDeviceBindings } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { gatewayDeviceUnauthorizedResponse } from "@/lib/gateway-auth";
import { serializeDeviceBinding } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext, requestCanAccessPatient } from "@/lib/server-access";

const bindingSchema = z.object({
  deviceId: z.string().min(1),
  patientId: z.string().min(1),
  placement: z.enum(["THIGH", "SHANK", "BRACE", "UNKNOWN"]),
  placementRevision: z.coerce.number().int().nonnegative().optional().default(0),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId") ?? undefined;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(getDemoDeviceBindings(patientId));
  }

  const gatewayOrUserCanAccessRequestedPatient = patientId
    ? await requestCanAccessPatient(request, patientId, true)
    : false;
  const access = gatewayOrUserCanAccessRequestedPatient ? null : await getDataAccessContext();
  if (!gatewayOrUserCanAccessRequestedPatient && !access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (patientId && access && !canAccessPatient(access, patientId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const scopedPatientIds = gatewayOrUserCanAccessRequestedPatient
    ? patientId ? [patientId] : []
    : access ? (patientId ? [patientId] : accessiblePatientIds(access)) : [];

  const bindings = await prisma.deviceBinding.findMany({
    where: {
      active: true,
      patientId: { in: scopedPatientIds ?? [] },
    },
    include: { device: true },
    orderBy: { boundAt: "desc" },
  });

  return NextResponse.json(bindings.map(serializeDeviceBinding));
}

export async function POST(request: Request) {
  const parsed = bindingSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device binding payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const binding = addDemoDeviceBinding(body);
    return binding ? NextResponse.json(binding) : NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  if (!await requestCanAccessPatient(request, body.patientId, true)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (request.headers.has("authorization")) {
    const forbidden = await gatewayDeviceUnauthorizedResponse(request, body.deviceId, body.patientId);
    if (forbidden) return forbidden;
  }

  await ensureDemoPatients();

  const binding = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'patient:' + body.patientId}))`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'device:' + body.deviceId}))`;
    const device = await transaction.device.findUnique({ where: { id: body.deviceId }, select: { ownerPatientId: true } });
    if (!device || device.ownerPatientId !== body.patientId) return null;
    const conflictingBindings = await transaction.deviceBinding.findMany({
      where: { deviceId: body.deviceId, active: true, patientId: { not: body.patientId } },
      select: { patientId: true },
    });
    const conflictingPatientIds = [...new Set(conflictingBindings.map((binding) => binding.patientId))];
    if (conflictingPatientIds.length > 0) {
      return null;
    }
    await transaction.sensorSession.updateMany({
      where: {
        patientId: body.patientId,
        status: "ACTIVE",
        placementRevision: { not: body.placementRevision },
      },
      data: { status: "ABORTED", endedAt: now },
    });
    await transaction.deviceBinding.updateMany({
      where: {
        patientId: body.patientId,
        active: true,
        OR: [
          { placementRevision: { not: body.placementRevision } },
          { placement: body.placement, deviceId: { not: body.deviceId } },
          { deviceId: body.deviceId, placement: { not: body.placement } },
        ],
      },
      data: { active: false, unboundAt: now },
    });

    const existing = await transaction.deviceBinding.findFirst({
      where: {
        deviceId: body.deviceId,
        patientId: body.patientId,
        placement: body.placement,
        placementRevision: body.placementRevision,
        active: true,
      },
      include: { device: true },
    });
    const result = existing ?? await transaction.deviceBinding.create({
      data: {
        deviceId: body.deviceId,
        patientId: body.patientId,
        placement: body.placement,
        placementRevision: body.placementRevision,
      },
      include: { device: true },
    });

    await transaction.device.update({
      where: { id: body.deviceId },
      data: { status: "ONLINE", lastSeenAt: now },
    });
    return result;
  });

  if (!binding) return NextResponse.json({ error: "Device belongs to another patient or is not registered", code: "DEVICE_OWNERSHIP_CONFLICT" }, { status: 409 });
  return NextResponse.json(serializeDeviceBinding(binding));
}
