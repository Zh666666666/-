import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoDevice, getDemoDevices } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { normalizeDeviceStatus, serializeDevice } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const deviceSchema = z.object({
  serialNo: z.string().min(1),
  name: z.string().min(1),
  model: z.string().optional().default("WT9011DCL-BT50"),
  manufacturer: z.string().optional().default("WitMotion"),
  firmwareVersion: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId") ?? undefined;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(getDemoDevices(patientId));
  }

  if (patientId) {
    const bindings = await prisma.deviceBinding.findMany({
      where: { patientId, active: true },
      include: { device: true },
      orderBy: { boundAt: "desc" },
    });

    return NextResponse.json(bindings.map((binding) => serializeDevice(binding.device)));
  }

  const devices = await prisma.device.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(devices.map(serializeDevice));
}

export async function POST(request: Request) {
  const parsed = deviceSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    return NextResponse.json(addDemoDevice(body));
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
