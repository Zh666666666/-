import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoDevice, addDemoDeviceBinding, addDemoSensorSample, addDemoSensorSession } from "@/lib/demo-store";
import { ensureDemoPatients } from "@/lib/data";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { calculateKneeAngleFromPitch } from "@/lib/hardware";
import { prisma } from "@/lib/prisma";
import { seedPatients } from "@/lib/rehab";

const simulatorSchema = z.object({
  patientId: z.string().optional(),
});

const SIMULATED_SOURCE = "DEMO" as const;
const SIMULATED_THIGH_SERIAL = "SIM-WT9011DCL-THIGH-001";
const SIMULATED_SHANK_SERIAL = "SIM-WT9011DCL-SHANK-001";

function makeSimulatedAngles() {
  const t = Date.now() / 1000;
  const thighPitch = 8 + Math.sin(t / 4) * 3;
  const shankPitch = thighPitch + 72 + Math.sin(t / 2.8) * 24;
  const angle = calculateKneeAngleFromPitch(thighPitch, shankPitch);

  return {
    thighPitch,
    shankPitch,
    ...angle,
  };
}

export async function POST(request: Request) {
  const parsed = simulatorSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid simulator payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const patientId = parsed.data.patientId ?? seedPatients[0].id;
  const simulated = makeSimulatedAngles();
  const now = new Date().toISOString();

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const thigh = addDemoDevice({ serialNo: SIMULATED_THIGH_SERIAL, name: "Simulated WT9011DCL-BT50 thigh sensor", model: "WT9011DCL-BT50" });
    const shank = addDemoDevice({ serialNo: SIMULATED_SHANK_SERIAL, name: "Simulated WT9011DCL-BT50 shank sensor", model: "WT9011DCL-BT50" });
    addDemoDeviceBinding({ deviceId: thigh.id, patientId, placement: "THIGH" });
    addDemoDeviceBinding({ deviceId: shank.id, patientId, placement: "SHANK" });
    const activeSession = addDemoSensorSession({ patientId, source: SIMULATED_SOURCE });
    const t = Date.now() / 1000;
    addDemoSensorSample({
      sessionId: activeSession.id,
      deviceId: thigh.id,
      patientId,
      source: SIMULATED_SOURCE,
      placement: "THIGH",
      recordedAt: now,
      roll: Math.sin(t / 3) * 4,
      pitch: simulated.thighPitch,
      yaw: Math.cos(t / 5) * 2,
      ax: 0.02 + Math.sin(t) * 0.03,
      ay: 0.01,
      az: 0.98,
      gx: Math.sin(t * 2) * 8,
      gy: Math.cos(t * 1.5) * 5,
      gz: Math.sin(t) * 3,
      flexionAngle: simulated.flexionAngle,
      extensionAngle: simulated.extensionAngle,
      confidence: simulated.confidence,
      batteryLevel: 89,
      signalStrength: 95,
      raw: { origin: "HARDWARE_SIMULATOR", kneeAngleMode: "DUAL_SENSOR", ...simulated },
    });
    const result = addDemoSensorSample({
      sessionId: activeSession.id,
      deviceId: shank.id,
      patientId,
      source: SIMULATED_SOURCE,
      placement: "SHANK",
      recordedAt: now,
      roll: Math.sin(t / 2.5) * 6,
      pitch: simulated.shankPitch,
      yaw: Math.cos(t / 4) * 3,
      ax: 0.03 + Math.cos(t) * 0.04,
      ay: -0.02,
      az: 0.96,
      gx: Math.cos(t * 2) * 10,
      gy: Math.sin(t * 1.2) * 7,
      gz: Math.cos(t) * 4,
      flexionAngle: simulated.flexionAngle,
      extensionAngle: simulated.extensionAngle,
      confidence: simulated.confidence,
      batteryLevel: 91,
      signalStrength: 96,
      raw: { origin: "HARDWARE_SIMULATOR", kneeAngleMode: "DUAL_SENSOR", ...simulated },
    });

    return NextResponse.json({ source: SIMULATED_SOURCE, session: activeSession, simulated, ...result });
  }

  await ensureDemoPatients();

  const thigh = await prisma.device.upsert({
    where: { serialNo: SIMULATED_THIGH_SERIAL },
    update: { lastSeenAt: new Date(now), status: "ONLINE", batteryLevel: 89, signalStrength: 95 },
    create: {
      serialNo: SIMULATED_THIGH_SERIAL,
      name: "Simulated WT9011DCL-BT50 thigh sensor",
      model: "WT9011DCL-BT50",
      manufacturer: "WitMotion",
      status: "ONLINE",
      batteryLevel: 89,
      signalStrength: 95,
      lastSeenAt: new Date(now),
    },
  });
  const shank = await prisma.device.upsert({
    where: { serialNo: SIMULATED_SHANK_SERIAL },
    update: { lastSeenAt: new Date(now), status: "ONLINE", batteryLevel: 90, signalStrength: 96 },
    create: {
      serialNo: SIMULATED_SHANK_SERIAL,
      name: "Simulated WT9011DCL-BT50 shank sensor",
      model: "WT9011DCL-BT50",
      manufacturer: "WitMotion",
      status: "ONLINE",
      batteryLevel: 90,
      signalStrength: 96,
      lastSeenAt: new Date(now),
    },
  });

  const existingBindings = await prisma.deviceBinding.findMany({ where: { patientId, active: true } });
  const hasThigh = existingBindings.some((binding) => binding.deviceId === thigh.id && binding.placement === "THIGH");
  const hasShank = existingBindings.some((binding) => binding.deviceId === shank.id && binding.placement === "SHANK");

  if (!hasThigh) {
    await prisma.deviceBinding.create({ data: { deviceId: thigh.id, patientId, placement: "THIGH" } });
  }

  if (!hasShank) {
    await prisma.deviceBinding.create({ data: { deviceId: shank.id, patientId, placement: "SHANK" } });
  }

  const session = await prisma.sensorSession.create({ data: { patientId, source: SIMULATED_SOURCE } });
  const response = await fetch(new URL("/api/sensor-samples", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: session.id,
      deviceId: shank.id,
      patientId,
      source: SIMULATED_SOURCE,
      placement: "SHANK",
      recordedAt: now,
      pitch: simulated.shankPitch,
      flexionAngle: simulated.flexionAngle,
      extensionAngle: simulated.extensionAngle,
      confidence: simulated.confidence,
      batteryLevel: 90,
      signalStrength: 96,
      raw: { origin: "HARDWARE_SIMULATOR", ...simulated },
    }),
  });

  const data = await response.json();
  return NextResponse.json({ source: SIMULATED_SOURCE, session, simulated, ...data });
}
