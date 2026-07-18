export type UserRole = "family" | "nurse";
export type Gender = "MALE" | "FEMALE" | "OTHER";

export type AiAnalysisItem = {
  id: string;
  patientId: string;
  patientName: string;
  flexionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore: number;
  provider: string;
  report: string;
  recommendation: string;
  createdAt: string;
};

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export type AppointmentItem = {
  id: string;
  patientName: string;
  patientPhone: string | null;
  expectedTime: string;
  description: string;
  status: AppointmentStatus;
  nurseName: string | null;
  scheduledTime: string | null;
  responseNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileItem = {
  id: string;
  userId: string;
  role: UserRole;
  name: string;
  age: number | null;
  gender: Gender | null;
  tkaSurgeryDate: string | null;
  affectedKnee: "LEFT" | "RIGHT" | "BILATERAL" | null;
  phone: string | null;
  emergencyContact: string | null;
  sensorDeviceId: string | null;
  department: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientSummary = {
  id: string;
  medicalRecordNo: string;
  name: string;
  age: number;
  roomNumber: string | null;
  surgeryDate: string;
  surgicalSide: "LEFT" | "RIGHT" | "BILATERAL";
  targetFlexion: number;
  status: "ACTIVE" | "OBSERVATION" | "DISCHARGED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

export type KneeDataPoint = {
  id: string;
  patientId: string;
  flexionAngle: number;
  extensionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore: number;
  batteryLevel: number;
  signalStrength: number;
  source: "SMART_BRACE" | "HARDWARE" | "MANUAL" | "DEMO";
  recordedAt: string;
};

export type DeviceStatus = "UNBOUND" | "ONLINE" | "OFFLINE" | "LOW_BATTERY";
export type DevicePlacement = "THIGH" | "SHANK" | "BRACE" | "UNKNOWN";
export type SensorSessionStatus = "ACTIVE" | "COMPLETED" | "ABORTED";
export type CalibrationQuality = "PENDING" | "GOOD" | "FAIR" | "POOR";

export type DeviceItem = {
  id: string;
  serialNo: string;
  name: string;
  model: string;
  manufacturer: string;
  status: DeviceStatus;
  firmwareVersion: string | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeviceBindingItem = {
  id: string;
  deviceId: string;
  patientId: string;
  placement: DevicePlacement;
  active: boolean;
  boundAt: string;
  unboundAt: string | null;
  device?: DeviceItem;
};

export type SensorSessionItem = {
  id: string;
  patientId: string;
  status: SensorSessionStatus;
  source: KneeDataPoint["source"];
  startedAt: string;
  endedAt: string | null;
  sampleCount: number;
};

export type SensorSampleItem = {
  id: string;
  gatewaySampleId?: string | null;
  captureSequence?: number | null;
  patientId: string;
  deviceId: string | null;
  sessionId: string | null;
  placement: DevicePlacement;
  source: KneeDataPoint["source"];
  recordedAt: string;
  receivedAt?: string | null;
  ingestLatencyMs?: number | null;
  ingestIntegrity?: "MATCHED" | "UNVERIFIED";
  protocol?: string | null;
  transport?: string | null;
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  flexionAngle: number | null;
  extensionAngle: number | null;
  confidence: number | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  kneeAngleMode: "DUAL_SENSOR" | "SINGLE_SENSOR_PROVISIONAL" | "UNKNOWN" | null;
  clinicalEligible: boolean;
};

export type CalibrationRecordItem = {
  id: string;
  patientId: string;
  sessionId: string | null;
  thighDeviceId: string | null;
  shankDeviceId: string | null;
  quality: CalibrationQuality;
  zeroFlexionAngle: number;
  notes: string | null;
  createdAt: string;
};

export type AlertType = "ROM_LOW" | "ACTIVITY_LOW" | "DURATION_LOW" | "PAIN_HIGH" | "DEVICE_OFFLINE";
export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AlertItem = {
  id: string;
  patientId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  message: string;
  metric: string | null;
  value: number | null;
  threshold: number | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export type NursingSoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type NursingRecordItem = {
  id: string;
  patientId: string;
  nurseName: string;
  actionType: string;
  guidance: string;
  notes: string | null;
  soap: NursingSoapFields | null;
  nextFollowUp: string | null;
  readAt: string | null;
  createdAt: string;
};

export type DashboardData = {
  patients: PatientSummary[];
  records: KneeDataPoint[];
  alerts: AlertItem[];
  nursingRecords: NursingRecordItem[];
  aiAnalyses: AiAnalysisItem[];
};

export function encodeNursingNotes(notes: string | null | undefined, soap?: NursingSoapFields | null) {
  if (!soap) {
    return notes ?? null;
  }

  return JSON.stringify({ kind: "SOAP", notes: notes ?? "", soap });
}

export function decodeNursingNotes(notes: string | null | undefined): { notes: string | null; soap: NursingSoapFields | null } {
  if (!notes) {
    return { notes: null, soap: null };
  }

  try {
    const parsed = JSON.parse(notes) as { kind?: string; notes?: string; soap?: Partial<NursingSoapFields> };

    if (parsed.kind === "SOAP" && parsed.soap) {
      return {
        notes: parsed.notes ?? null,
        soap: {
          subjective: parsed.soap.subjective ?? "",
          objective: parsed.soap.objective ?? "",
          assessment: parsed.soap.assessment ?? "",
          plan: parsed.soap.plan ?? "",
        },
      };
    }
  } catch {
    return { notes, soap: null };
  }

  return { notes, soap: null };
}

export function serializeNursingRecord(record: {
  id: string;
  patientId: string;
  nurseName: string;
  actionType: string;
  guidance: string;
  notes: string | null;
  nextFollowUp?: Date | string | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
}): NursingRecordItem {
  const decoded = decodeNursingNotes(record.notes);
  return {
    id: record.id,
    patientId: record.patientId,
    nurseName: record.nurseName,
    actionType: record.actionType,
    guidance: record.guidance,
    notes: decoded.notes,
    soap: decoded.soap,
    nextFollowUp: record.nextFollowUp ? new Date(record.nextFollowUp).toISOString() : null,
    readAt: record.readAt ? new Date(record.readAt).toISOString() : null,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

export const seedPatients: PatientSummary[] = [
  {
    id: "demo-patient-1",
    medicalRecordNo: "TKA-2026-001",
    name: "王桂兰",
    age: 72,
    roomNumber: "康复 3 床",
    surgeryDate: "2026-04-09T00:00:00.000Z",
    surgicalSide: "RIGHT",
    targetFlexion: 110,
    status: "ACTIVE",
    riskLevel: "HIGH",
  },
  {
    id: "demo-patient-2",
    medicalRecordNo: "TKA-2026-002",
    name: "李建国",
    age: 68,
    roomNumber: "康复 8 床",
    surgeryDate: "2026-04-12T00:00:00.000Z",
    surgicalSide: "LEFT",
    targetFlexion: 105,
    status: "OBSERVATION",
    riskLevel: "MEDIUM",
  },
  {
    id: "demo-patient-3",
    medicalRecordNo: "TKA-2026-003",
    name: "陈素英",
    age: 75,
    roomNumber: "居家随访",
    surgeryDate: "2026-04-04T00:00:00.000Z",
    surgicalSide: "RIGHT",
    targetFlexion: 115,
    status: "ACTIVE",
    riskLevel: "LOW",
  },
];

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function daysAfterSurgery(value: string | Date) {
  const started = new Date(value).getTime();
  const diff = Date.now() - started;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function assessKneeRecord(record: {
  flexionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore?: number;
}): {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
} | null {
  if (record.flexionAngle < 78) {
    return {
      type: "ROM_LOW",
      severity: "HIGH" as const,
      title: "屈曲角度低于康复阈值",
      message: `当前屈曲 ${record.flexionAngle.toFixed(0)}°，建议立即远程指导并复核疼痛情况。`,
      metric: "flexionAngle",
      value: record.flexionAngle,
      threshold: 78,
    };
  }

  if (record.activityFrequency < 6) {
    return {
      type: "ACTIVITY_LOW",
      severity: "MEDIUM" as const,
      title: "活动频次偏低",
      message: `今日训练频次 ${record.activityFrequency} 次，低于建议频次。`,
      metric: "activityFrequency",
      value: record.activityFrequency,
      threshold: 6,
    };
  }

  if (record.activityDuration < 18) {
    return {
      type: "DURATION_LOW",
      severity: "MEDIUM" as const,
      title: "训练时长不足",
      message: `累计训练 ${record.activityDuration} 分钟，建议补充短时多组训练。`,
      metric: "activityDuration",
      value: record.activityDuration,
      threshold: 18,
    };
  }

  if ((record.painScore ?? 0) >= 7) {
    return {
      type: "PAIN_HIGH",
      severity: "HIGH" as const,
      title: "疼痛评分升高",
      message: `疼痛评分 ${record.painScore} 分，需要护士评估是否调整训练强度。`,
      metric: "painScore",
      value: record.painScore ?? 0,
      threshold: 7,
    };
  }

  return null;
}

export function createDemoRecord(patientId = seedPatients[0].id): KneeDataPoint {
  const now = new Date();
  const minute = now.getMinutes();
  const anomaly = minute % 7 === 0;

  return {
    id: `demo-${now.getTime()}`,
    patientId,
    flexionAngle: Math.max(58, Math.round((anomaly ? 68 : 88 + Math.sin(now.getTime() / 90000) * 18) * 10) / 10),
    extensionAngle: Math.round((2 + Math.random() * 4) * 10) / 10,
    activityFrequency: anomaly ? 4 : 8 + Math.floor(Math.random() * 8),
    activityDuration: anomaly ? 14 : 24 + Math.floor(Math.random() * 24),
    painScore: anomaly ? 7 : Math.floor(Math.random() * 5),
    batteryLevel: 86 + Math.floor(Math.random() * 12),
    signalStrength: 88 + Math.floor(Math.random() * 10),
    source: "DEMO",
    recordedAt: now.toISOString(),
  };
}

export function createInitialRecords() {
  return seedPatients.flatMap((patient, patientIndex) => {
    return Array.from({ length: 10 }, (_, index) => {
      const recordedAt = new Date(Date.now() - (10 - index) * 8 * 60_000 - patientIndex * 90_000);
      const base = patientIndex === 0 ? 82 : patientIndex === 1 ? 90 : 98;
      const low = patientIndex === 0 && index > 6;

      return {
        id: `seed-${patient.id}-${index}`,
        patientId: patient.id,
        flexionAngle: low ? 70 + index : Math.round((base + Math.sin(index / 1.3) * 8 + index * 1.2) * 10) / 10,
        extensionAngle: Math.round((2 + Math.random() * 3) * 10) / 10,
        activityFrequency: low ? 4 + (index % 2) : 8 + patientIndex + index,
        activityDuration: low ? 13 + index : 22 + index * 3,
        painScore: low ? 7 : Math.max(0, 4 - patientIndex),
        batteryLevel: 88 + patientIndex * 2,
        signalStrength: 92 - patientIndex,
        source: "DEMO" as const,
        recordedAt: recordedAt.toISOString(),
      };
    });
  });
}
