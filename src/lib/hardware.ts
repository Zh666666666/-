import type {
  CalibrationRecordItem,
  DeviceBindingItem,
  DeviceItem,
  DevicePlacement,
  DeviceStatus,
  SensorSessionItem,
} from "@/lib/rehab";

export type WitMotionSample = {
  deviceId?: string;
  serialNo?: string;
  placement?: DevicePlacement;
  timestamp?: string;
  roll?: number;
  pitch?: number;
  yaw?: number;
  q0?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  ax?: number;
  ay?: number;
  az?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  batteryLevel?: number;
  signalStrength?: number;
  raw?: unknown;
};

export type KneeAngleResult = {
  flexionAngle: number;
  extensionAngle: number;
  confidence: number;
};

export function normalizeDeviceStatus(input: {
  batteryLevel?: number | null;
  lastSeenAt?: Date | string | null;
}): DeviceStatus {
  if (typeof input.batteryLevel === "number" && input.batteryLevel <= 20) {
    return "LOW_BATTERY";
  }

  if (!input.lastSeenAt) {
    return "UNBOUND";
  }

  const lastSeen = new Date(input.lastSeenAt).getTime();
  return Date.now() - lastSeen > 90_000 ? "OFFLINE" : "ONLINE";
}

export function calculateKneeAngleFromPitch(thighPitch: number, shankPitch: number, zeroFlexionAngle = 0): KneeAngleResult {
  const relative = Math.abs(shankPitch - thighPitch - zeroFlexionAngle);
  const flexionAngle = Math.max(0, Math.min(150, Math.round(relative * 10) / 10));
  const extensionAngle = Math.max(-20, Math.min(40, Math.round((zeroFlexionAngle - relative) * 10) / 10));

  return {
    flexionAngle,
    extensionAngle,
    confidence: 0.72,
  };
}

export function calculateKneeAngleFromSamples(thigh: WitMotionSample, shank: WitMotionSample, zeroFlexionAngle = 0): KneeAngleResult | null {
  if (typeof thigh.pitch !== "number" || typeof shank.pitch !== "number") {
    return null;
  }

  return calculateKneeAngleFromPitch(thigh.pitch, shank.pitch, zeroFlexionAngle);
}

export function serializeDevice(device: {
  id: string;
  serialNo: string;
  name: string;
  model: string;
  manufacturer: string;
  status: DeviceStatus;
  firmwareVersion: string | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): DeviceItem {
  return {
    ...device,
    lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
    createdAt: new Date(device.createdAt).toISOString(),
    updatedAt: new Date(device.updatedAt).toISOString(),
  };
}

export function serializeDeviceBinding(binding: {
  id: string;
  deviceId: string;
  patientId: string;
  placement: DevicePlacement;
  placementRevision?: number;
  active: boolean;
  boundAt: Date | string;
  unboundAt: Date | string | null;
  device?: Parameters<typeof serializeDevice>[0] | null;
}): DeviceBindingItem {
  return {
    id: binding.id,
    deviceId: binding.deviceId,
    patientId: binding.patientId,
    placement: binding.placement,
    placementRevision: binding.placementRevision ?? 0,
    active: binding.active,
    boundAt: new Date(binding.boundAt).toISOString(),
    unboundAt: binding.unboundAt ? new Date(binding.unboundAt).toISOString() : null,
    device: binding.device ? serializeDevice(binding.device) : undefined,
  };
}

export function serializeSensorSession(session: {
  id: string;
  patientId: string;
  status: SensorSessionItem["status"];
  source: SensorSessionItem["source"];
  placementRevision?: number;
  startedAt: Date | string;
  endedAt: Date | string | null;
  sampleCount: number;
}): SensorSessionItem {
  return {
    ...session,
    placementRevision: session.placementRevision ?? 0,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null,
  };
}

export function serializeCalibrationRecord(record: {
  id: string;
  patientId: string;
  sessionId: string | null;
  thighDeviceId: string | null;
  shankDeviceId: string | null;
  placementRevision?: number;
  quality: CalibrationRecordItem["quality"];
  zeroFlexionAngle: number;
  notes: string | null;
  createdAt: Date | string;
}): CalibrationRecordItem {
  return {
    ...record,
    placementRevision: record.placementRevision ?? 0,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}
