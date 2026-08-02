import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessPatient } from "@/lib/access-control";
import { addDemoDevice, getDemoDevices } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { normalizeDeviceStatus, serializeDevice } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";
import { getDataAccessContext } from "@/lib/server-access";

const deviceSchema = z.object({
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
  const scopedPatientId = access.unrestricted ? patientId : access.patientId ?? "__none__";

  if (scopedPatientId) {
    const bindings = await prisma.deviceBinding.findMany({
      where: { patientId: scopedPatientId, active: true },
      include: { device: true },
      orderBy: { boundAt: "desc" },
    });

    return NextResponse.json(bindings.map((binding) => serializeDevice(binding.device)));
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

  if (gatewayUnauthorizedResponse(request)) {
    const access = await getDataAccessContext();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const device = await prisma.device.upsert({
    where: { serialNo: body.serialNo },
    update: {
      name: body.name,
      model: body.model,
      manufacturer: body.manufacturer,
      firmwareVersion: body.firmwareVersion ?? null,
    },
    create: {
      serialNo: body.serialNo,
      name: body.name,
      model: body.model,
      manufacturer: body.manufacturer,
      firmwareVersion: body.firmwareVersion ?? null,
      deviceToken: crypto.randomUUID(),
      status: normalizeDeviceStatus({ lastSeenAt: null }),
    },
  });

  return NextResponse.json(serializeDevice(device));
}
