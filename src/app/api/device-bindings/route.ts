import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoDeviceBinding, getDemoDeviceBindings } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { serializeDeviceBinding } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const bindingSchema = z.object({
  deviceId: z.string().min(1),
  patientId: z.string().min(1),
  placement: z.enum(["THIGH", "SHANK", "BRACE", "UNKNOWN"]),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId") ?? undefined;

  if (!hasUsableDatabaseUrl()) {
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
  const parsed = bindingSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device binding payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    const binding = addDemoDeviceBinding(body);
    return binding ? NextResponse.json(binding) : NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  await ensureDemoPatients();

  await prisma.deviceBinding.updateMany({
    where: {
      patientId: body.patientId,
      placement: body.placement,
      active: true,
    },
    data: {
      active: false,
      unboundAt: new Date(),
    },
  });

  const binding = await prisma.deviceBinding.create({
    data: {
      deviceId: body.deviceId,
      patientId: body.patientId,
      placement: body.placement,
    },
    include: { device: true },
  });

  await prisma.device.update({
    where: { id: body.deviceId },
    data: {
      status: "ONLINE",
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json(serializeDeviceBinding(binding));
}
