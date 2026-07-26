import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoDeviceBinding, getDemoDeviceBindings } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { serializeDeviceBinding } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

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

  const bindings = await prisma.deviceBinding.findMany({
    where: {
      active: true,
      patientId,
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

  await ensureDemoPatients();

  const binding = await prisma.$transaction(async (transaction) => {
    const now = new Date();
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

  return NextResponse.json(serializeDeviceBinding(binding));
}
