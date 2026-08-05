import { NextResponse } from "next/server";
import { z } from "zod";

import { updateDemoDeviceHeartbeat } from "@/lib/demo-store";
import { updateOrNull } from "@/lib/api-errors";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { gatewayUnauthorizedResponse } from "@/lib/gateway-auth";
import { isDemoMode } from "@/lib/env";
import { normalizeDeviceStatus, serializeDevice } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";

const heartbeatSchema = z.object({
  deviceId: z.string().optional(),
  serialNo: z.string().optional(),
  batteryLevel: z.coerce.number().int().min(0).max(100).optional().nullable(),
  signalStrength: z.coerce.number().int().min(0).max(100).optional().nullable(),
}).refine((value) => value.deviceId || value.serialNo, "deviceId or serialNo is required");

export async function POST(request: Request) {
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid heartbeat payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const unauthorized = gatewayUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  if (isDemoMode()) {
    const device = updateDemoDeviceHeartbeat(body);
    return device ? NextResponse.json(device) : NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const now = new Date();
  const device = await updateOrNull(prisma.device.update({
    where: body.deviceId ? { id: body.deviceId } : { serialNo: body.serialNo },
    data: {
      batteryLevel: body.batteryLevel ?? undefined,
      signalStrength: body.signalStrength ?? undefined,
      lastSeenAt: now,
      status: normalizeDeviceStatus({ batteryLevel: body.batteryLevel, lastSeenAt: now }),
    },
  }));

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  return NextResponse.json(serializeDevice(device));
}
