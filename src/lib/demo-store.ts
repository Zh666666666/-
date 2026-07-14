import {
  assessKneeRecord,
  createInitialRecords,
  seedPatients,
  type AlertItem,
  type AiAnalysisItem,
  type AppointmentItem,
  type AppointmentStatus,
  type CalibrationRecordItem,
  type DashboardData,
  type DeviceBindingItem,
  type DeviceItem,
  type DevicePlacement,
  type KneeDataPoint,
  type SensorSampleItem,
  type SensorSessionItem,
  encodeNursingNotes,
  serializeNursingRecord,
  type NursingRecordItem,
  type NursingSoapFields,
  type ProfileItem,
  type UserRole,
} from "@/lib/rehab";
import { calculateRehabMetrics } from "@/lib/rehab-metrics";
import { resolveSensorDataSource } from "@/lib/sample-provenance";
import {
  alertCooldownMs,
  isClinicalKneeAngle,
  shouldMaterializeClinicalRecord,
} from "@/lib/sensor-ingestion";

type DemoNursingRecord = Omit<NursingRecordItem, "soap">;

type DemoState = Omit<DashboardData, "nursingRecords"> & {
  nursingRecords: DemoNursingRecord[];
  profiles: ProfileItem[];
  appointments: AppointmentItem[];
  devices: DeviceItem[];
  deviceBindings: DeviceBindingItem[];
  sensorSessions: SensorSessionItem[];
  sensorSamples: SensorSampleItem[];
  gatewaySampleIds: Set<string>;
  calibrationRecords: CalibrationRecordItem[];
};

const MAX_DEMO_SENSOR_SAMPLES = 500;

function resolveKneeAngleMode(raw: unknown, confidence: number | null | undefined): SensorSampleItem["kneeAngleMode"] {
  if (raw && typeof raw === "object" && "kneeAngleMode" in raw) {
    const mode = (raw as { kneeAngleMode?: unknown }).kneeAngleMode;
    if (mode === "DUAL_SENSOR" || mode === "SINGLE_SENSOR_PROVISIONAL" || mode === "UNKNOWN") {
      return mode;
    }
  }

  if (typeof confidence === "number") {
    return isClinicalKneeAngle(confidence) ? "DUAL_SENSOR" : "SINGLE_SENSOR_PROVISIONAL";
  }

  return null;
}

type AiAnalysisInput = Omit<AiAnalysisItem, "id" | "createdAt">;

type KneeRecordInput = {
  patientId: string;
  flexionAngle: number;
  extensionAngle?: number;
  activityFrequency: number;
  activityDuration: number;
  painScore?: number;
  batteryLevel?: number;
  signalStrength?: number;
  source?: KneeDataPoint["source"];
  recordedAt?: string;
  assessmentScope?: "full" | "rom-only";
};

type NursingRecordInput = {
  patientId: string;
  nurseName?: string;
  actionType?: string;
  guidance: string;
  notes?: string | null;
  soap?: NursingSoapFields | null;
  nextFollowUp?: string | null;
};

type ProfileInput = Partial<Omit<ProfileItem, "id" | "userId" | "role" | "createdAt" | "updatedAt">> & {
  userId?: string;
  role: UserRole;
};

type AppointmentInput = {
  patientName: string;
  patientPhone?: string | null;
  expectedTime: string;
  description: string;
};

type AppointmentUpdateInput = {
  status: AppointmentStatus;
  nurseName?: string | null;
  scheduledTime?: string | null;
  responseNote?: string | null;
};

type DeviceInput = {
  serialNo: string;
  name: string;
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string | null;
};

type DeviceBindingInput = {
  deviceId: string;
  patientId: string;
  placement: DevicePlacement;
};

type DeviceHeartbeatInput = {
  deviceId?: string;
  serialNo?: string;
  batteryLevel?: number | null;
  signalStrength?: number | null;
};

type SensorSessionInput = {
  patientId: string;
  source?: KneeDataPoint["source"];
};

type SensorSampleInput = {
  gatewaySampleId?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  patientId: string;
  source?: KneeDataPoint["source"];
  placement?: DevicePlacement;
  recordedAt?: string;
  roll?: number | null;
  pitch?: number | null;
  yaw?: number | null;
  q0?: number | null;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  ax?: number | null;
  ay?: number | null;
  az?: number | null;
  gx?: number | null;
  gy?: number | null;
  gz?: number | null;
  flexionAngle?: number | null;
  extensionAngle?: number | null;
  confidence?: number | null;
  batteryLevel?: number | null;
  signalStrength?: number | null;
  raw?: unknown;
};

type CalibrationInput = {
  patientId: string;
  sessionId?: string | null;
  thighDeviceId?: string | null;
  shankDeviceId?: string | null;
  quality?: CalibrationRecordItem["quality"];
  zeroFlexionAngle?: number;
  notes?: string | null;
};

const globalForDemo = globalThis as unknown as {
  rehabDemoState?: DemoState;
};

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createAlert(
  record: Pick<KneeDataPoint, "patientId" | "flexionAngle" | "activityFrequency" | "activityDuration" | "painScore">,
  existingAlerts: AlertItem[] = [],
  assessmentScope: "full" | "rom-only" = "full",
) {
  const assessment = assessmentScope === "rom-only"
    ? record.flexionAngle < 78
      ? assessKneeRecord({
          flexionAngle: record.flexionAngle,
          activityFrequency: 99,
          activityDuration: 99,
          painScore: 0,
        })
      : null
    : assessKneeRecord(record);

  if (!assessment) {
    return null;
  }

  const cooldownStartedAt = Date.now() - alertCooldownMs;
  const duplicate = existingAlerts.some((alert) => (
    alert.patientId === record.patientId
    && alert.type === assessment.type
    && alert.status !== "RESOLVED"
    && new Date(alert.createdAt).getTime() >= cooldownStartedAt
  ));

  if (duplicate) {
    return null;
  }

  return {
    id: createId("alert"),
    patientId: record.patientId,
    type: assessment.type,
    severity: assessment.severity,
    status: "OPEN",
    title: assessment.title,
    message: assessment.message,
    metric: assessment.metric,
    value: assessment.value,
    threshold: assessment.threshold,
    createdAt: new Date().toISOString(),
  } satisfies AlertItem;
}

function initialState(): DemoState {
  const records = createInitialRecords();
  const alerts = records.flatMap((record) => {
    const alert = createAlert(record);
    return alert ? [alert] : [];
  });

  const now = new Date().toISOString();

  return {
    profiles: [
      {
        id: "demo-profile-family",
        userId: "demo-family-user",
        role: "family",
        name: seedPatients[0].name,
        age: seedPatients[0].age,
        gender: "FEMALE",
        tkaSurgeryDate: seedPatients[0].surgeryDate,
        affectedKnee: seedPatients[0].surgicalSide,
        phone: "13800000001",
        emergencyContact: "王女士家属 13900000001",
        sensorDeviceId: "TKA-BRACE-001",
        department: null,
        title: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-profile-nurse",
        userId: "demo-nurse-user",
        role: "nurse",
        name: "刘护士",
        age: null,
        gender: null,
        tkaSurgeryDate: null,
        affectedKnee: null,
        phone: "13800000002",
        emergencyContact: null,
        sensorDeviceId: null,
        department: "骨科康复护理组",
        title: "主管护师",
        createdAt: now,
        updatedAt: now,
      },
    ],
    aiAnalyses: [],
    devices: [
      {
        id: "demo-device-thigh",
        serialNo: "WT9011DCL-THIGH-001",
        name: "WT9011DCL-BT50 thigh sensor",
        model: "WT9011DCL-BT50",
        manufacturer: "WitMotion",
        status: "ONLINE",
        firmwareVersion: null,
        batteryLevel: 88,
        signalStrength: 94,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-device-shank",
        serialNo: "WT9011DCL-SHANK-001",
        name: "WT9011DCL-BT50 shank sensor",
        model: "WT9011DCL-BT50",
        manufacturer: "WitMotion",
        status: "ONLINE",
        firmwareVersion: null,
        batteryLevel: 90,
        signalStrength: 95,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    deviceBindings: [
      {
        id: "demo-binding-thigh",
        deviceId: "demo-device-thigh",
        patientId: seedPatients[0].id,
        placement: "THIGH",
        active: true,
        boundAt: now,
        unboundAt: null,
      },
      {
        id: "demo-binding-shank",
        deviceId: "demo-device-shank",
        patientId: seedPatients[0].id,
        placement: "SHANK",
        active: true,
        boundAt: now,
        unboundAt: null,
      },
    ],
    sensorSessions: [],
    sensorSamples: [],
    gatewaySampleIds: new Set(),
    calibrationRecords: [
      {
        id: "demo-calibration-1",
        patientId: seedPatients[0].id,
        sessionId: null,
        thighDeviceId: "demo-device-thigh",
        shankDeviceId: "demo-device-shank",
        quality: "GOOD",
        zeroFlexionAngle: 0,
        notes: "Demo zero point for full knee extension.",
        createdAt: now,
      },
    ],
    appointments: [
      {
        id: "demo-appointment-1",
        patientName: seedPatients[0].name,
        patientPhone: "13800000001",
        expectedTime: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        description: "家人训练后膝关节有些肿胀，家属担心陪练方式不正确，希望护士上门评估肿胀、疼痛、步态和居家防跌倒环境，并教家属如何更安心地陪练。",
        status: "PENDING",
        nurseName: null,
        scheduledTime: null,
        responseNote: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    patients: seedPatients,
    records,
    alerts: alerts.slice(-8).reverse(),
    nursingRecords: [
      {
        id: createId("nursing"),
        patientId: seedPatients[0].id,
        nurseName: "刘护士",
        actionType: "REMOTE_GUIDANCE",
        guidance: "今天先完成坐位屈膝 3 组，每组 8 次。家属陪练时先问疼痛和紧张程度，疼痛超过 6 分、肿胀明显或家人皱眉屏气时立即暂停。",
        notes: encodeNursingNotes("已向家属说明：预警代表需要复核，不等于恢复变差。家属可理解动作要点，需继续观察屈曲角度、肿胀趋势和夜间起身安全。", {
          subjective: "患者诉训练后膝部酸胀，可耐受，无夜间痛加重；家属担心陪练过量。",
          objective: "智能护膝显示屈曲角度较前改善，疼痛评分 4 分，设备在线，步态需继续观察。",
          assessment: "康复依从性尚可，伴轻度康复焦虑和家庭照护压力，需继续监测屈曲角度和肿胀趋势。",
          plan: "维持坐位屈膝训练，每 2 小时 1 组；家属用鼓励代替催促，疼痛超过 6 分暂停并联系护士。",
        }),
        nextFollowUp: null,
        readAt: null,
        createdAt: new Date(Date.now() - 18 * 60_000).toISOString(),
      },
    ],
  };
}

function getState() {
  globalForDemo.rehabDemoState ??= initialState();
  const state = globalForDemo.rehabDemoState;
  // Hot reload / long-lived demo process may keep an older shape.
  if (!Array.isArray(state.sensorSamples)) {
    state.sensorSamples = [];
  }
  if (!(state.gatewaySampleIds instanceof Set)) {
    state.gatewaySampleIds = new Set();
  }
  return state;
}

export function getDemoDashboardData(): DashboardData {
  const state = getState();

  const familyProfile = state.profiles.find((profile) => profile.role === "family");
  const patients = state.patients.map((patient, index) => {
    if (index !== 0 || !familyProfile) {
      return patient;
    }

    return {
      ...patient,
      name: familyProfile.name,
      age: familyProfile.age ?? patient.age,
      surgeryDate: familyProfile.tkaSurgeryDate ?? patient.surgeryDate,
      surgicalSide: familyProfile.affectedKnee ?? patient.surgicalSide,
    };
  });

  return {
    patients,
    records: [...state.records],
    alerts: [...state.alerts],
    nursingRecords: state.nursingRecords.map(serializeNursingRecord),
    aiAnalyses: [...state.aiAnalyses],
  };
}

export function getDemoProfile(role: UserRole) {
  const state = getState();
  return state.profiles.find((profile) => profile.role === role) ?? null;
}

export function addDemoAiAnalysis(input: AiAnalysisInput) {
  const state = getState();
  const analysis = {
    id: createId("ai"),
    ...input,
    createdAt: new Date().toISOString(),
  } satisfies AiAnalysisItem;

  state.aiAnalyses = [analysis, ...state.aiAnalyses].slice(0, 20);
  return analysis;
}

export function upsertDemoProfile(input: ProfileInput) {
  const state = getState();
  const existing = state.profiles.find((profile) => profile.role === input.role);
  const now = new Date().toISOString();

  if (existing) {
    Object.assign(existing, input, { updatedAt: now });
    return existing;
  }

  const profile = {
    id: createId("profile"),
    userId: input.userId ?? `demo-${input.role}-user`,
    role: input.role,
    name: input.name ?? (input.role === "family" ? "演示家属" : "演示护士"),
    age: input.age ?? null,
    gender: input.gender ?? null,
    tkaSurgeryDate: input.tkaSurgeryDate ?? null,
    affectedKnee: input.affectedKnee ?? null,
    phone: input.phone ?? null,
    emergencyContact: input.emergencyContact ?? null,
    sensorDeviceId: input.sensorDeviceId ?? null,
    department: input.department ?? null,
    title: input.title ?? null,
    createdAt: now,
    updatedAt: now,
  } satisfies ProfileItem;

  state.profiles.push(profile);
  return profile;
}

export function getDemoAppointments() {
  const state = getState();
  return [...state.appointments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addDemoAppointment(input: AppointmentInput) {
  const state = getState();
  const now = new Date().toISOString();
  const appointment = {
    id: createId("appointment"),
    patientName: input.patientName,
    patientPhone: input.patientPhone ?? null,
    expectedTime: input.expectedTime,
    description: input.description,
    status: "PENDING",
    nurseName: null,
    scheduledTime: null,
    responseNote: null,
    createdAt: now,
    updatedAt: now,
  } satisfies AppointmentItem;

  state.appointments = [appointment, ...state.appointments];
  return appointment;
}

export function updateDemoAppointment(id: string, input: AppointmentUpdateInput) {
  const state = getState();
  const appointment = state.appointments.find((item) => item.id === id);

  if (!appointment) {
    return null;
  }

  Object.assign(appointment, input, { updatedAt: new Date().toISOString() });
  return appointment;
}

export function addDemoKneeRecord(input: KneeRecordInput) {
  const state = getState();
  const record = {
    id: createId("knee"),
    patientId: input.patientId,
    flexionAngle: input.flexionAngle,
    extensionAngle: input.extensionAngle ?? 0,
    activityFrequency: input.activityFrequency,
    activityDuration: input.activityDuration,
    painScore: input.painScore ?? 0,
    batteryLevel: input.batteryLevel ?? 92,
    signalStrength: input.signalStrength ?? 96,
    source: input.source ?? "SMART_BRACE",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  } satisfies KneeDataPoint;

  const alert = createAlert(record, state.alerts, input.assessmentScope ?? "full");
  state.records = [...state.records, record].slice(-160);

  if (alert) {
    state.alerts = [alert, ...state.alerts].slice(0, 20);
  }

  return { record, alert };
}

export function addDemoNursingRecord(input: NursingRecordInput) {
  const state = getState();
  const record = {
    id: createId("nursing"),
    patientId: input.patientId,
    nurseName: input.nurseName ?? "康复护士",
    actionType: input.actionType ?? "REMOTE_GUIDANCE",
    guidance: input.guidance,
    notes: encodeNursingNotes(input.notes, input.soap),
    nextFollowUp: input.nextFollowUp ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
  } satisfies DemoNursingRecord;

  state.nursingRecords = [record, ...state.nursingRecords].slice(0, 20);
  return serializeNursingRecord(record);
}

export function markDemoNursingRecordRead(id: string) {
  const state = getState();
  const record = state.nursingRecords.find((item) => item.id === id);

  if (!record) {
    return null;
  }

  record.readAt = new Date().toISOString();
  return serializeNursingRecord(record);
}

export function resolveDemoAlert(id: string) {
  const state = getState();
  const alert = state.alerts.find((item) => item.id === id);

  if (!alert) {
    return null;
  }

  alert.status = "RESOLVED";
  return alert;
}

export function getDemoDevices(patientId?: string) {
  const state = getState();

  if (!patientId) {
    return state.devices;
  }

  const boundIds = new Set(state.deviceBindings.filter((binding) => binding.patientId === patientId && binding.active).map((binding) => binding.deviceId));
  return state.devices.filter((device) => boundIds.has(device.id));
}

export function addDemoDevice(input: DeviceInput) {
  const state = getState();
  const existing = state.devices.find((device) => device.serialNo === input.serialNo);
  const now = new Date().toISOString();

  if (existing) {
    Object.assign(existing, {
      name: input.name,
      model: input.model ?? existing.model,
      manufacturer: input.manufacturer ?? existing.manufacturer,
      firmwareVersion: input.firmwareVersion ?? existing.firmwareVersion,
      updatedAt: now,
    });
    return existing;
  }

  const device = {
    id: createId("device"),
    serialNo: input.serialNo,
    name: input.name,
    model: input.model ?? "WT9011DCL-BT50",
    manufacturer: input.manufacturer ?? "WitMotion",
    status: "UNBOUND",
    firmwareVersion: input.firmwareVersion ?? null,
    batteryLevel: null,
    signalStrength: null,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies DeviceItem;

  state.devices = [device, ...state.devices];
  return device;
}

export function addDemoDeviceBinding(input: DeviceBindingInput) {
  const state = getState();
  const now = new Date().toISOString();
  const device = state.devices.find((item) => item.id === input.deviceId);

  if (!device) {
    return null;
  }

  for (const binding of state.deviceBindings) {
    if (binding.patientId === input.patientId && binding.placement === input.placement && binding.active) {
      binding.active = false;
      binding.unboundAt = now;
    }
  }

  const binding = {
    id: createId("binding"),
    deviceId: input.deviceId,
    patientId: input.patientId,
    placement: input.placement,
    active: true,
    boundAt: now,
    unboundAt: null,
    device,
  } satisfies DeviceBindingItem;

  device.status = "ONLINE";
  device.lastSeenAt = now;
  device.updatedAt = now;
  state.deviceBindings = [binding, ...state.deviceBindings];
  return binding;
}

export function getDemoDeviceBindings(patientId?: string) {
  const state = getState();
  return state.deviceBindings
    .filter((binding) => binding.active && (!patientId || binding.patientId === patientId))
    .map((binding) => ({
      ...binding,
      device: state.devices.find((device) => device.id === binding.deviceId),
    }));
}

export function updateDemoDeviceHeartbeat(input: DeviceHeartbeatInput) {
  const state = getState();
  const device = state.devices.find((item) => item.id === input.deviceId || item.serialNo === input.serialNo);

  if (!device) {
    return null;
  }

  const now = new Date().toISOString();
  device.batteryLevel = input.batteryLevel ?? device.batteryLevel;
  device.signalStrength = input.signalStrength ?? device.signalStrength;
  device.lastSeenAt = now;
  device.status = typeof device.batteryLevel === "number" && device.batteryLevel <= 20 ? "LOW_BATTERY" : "ONLINE";
  device.updatedAt = now;
  return device;
}

export function addDemoSensorSession(input: SensorSessionInput) {
  const state = getState();
  const session = {
    id: createId("session"),
    patientId: input.patientId,
    status: "ACTIVE",
    source: input.source ?? "HARDWARE",
    startedAt: new Date().toISOString(),
    endedAt: null,
    sampleCount: 0,
  } satisfies SensorSessionItem;

  state.sensorSessions = [session, ...state.sensorSessions];
  return session;
}

export function finishDemoSensorSession(id: string, status: "COMPLETED" | "ABORTED" = "COMPLETED") {
  const state = getState();
  const session = state.sensorSessions.find((item) => item.id === id);

  if (!session) {
    return null;
  }

  session.status = status;
  session.endedAt = new Date().toISOString();
  return session;
}

export function addDemoSensorSample(input: SensorSampleInput) {
  const state = getState();
  if (input.gatewaySampleId && state.gatewaySampleIds.has(input.gatewaySampleId)) {
    return { sample: null, record: null, alert: null, duplicate: true };
  }

  const session = input.sessionId ? state.sensorSessions.find((item) => item.id === input.sessionId) : null;
  const device = input.deviceId ? state.devices.find((item) => item.id === input.deviceId) : null;
  const now = input.recordedAt ?? new Date().toISOString();
  const source = resolveSensorDataSource(session?.source, input.source);

  if (input.gatewaySampleId) {
    state.gatewaySampleIds.add(input.gatewaySampleId);
  }

  if (session) {
    session.sampleCount += 1;
  }

  if (device) {
    device.batteryLevel = input.batteryLevel ?? device.batteryLevel;
    device.signalStrength = input.signalStrength ?? device.signalStrength;
    device.lastSeenAt = now;
    device.status = typeof device.batteryLevel === "number" && device.batteryLevel <= 20 ? "LOW_BATTERY" : "ONLINE";
    device.updatedAt = now;
  }

  const confidence = typeof input.confidence === "number" ? input.confidence : null;
  const kneeAngleMode = resolveKneeAngleMode(input.raw, confidence);
  const sample: SensorSampleItem = {
    id: createId("sample"),
    patientId: input.patientId,
    deviceId: input.deviceId ?? null,
    sessionId: input.sessionId ?? null,
    placement: input.placement ?? "UNKNOWN",
    source,
    recordedAt: now,
    roll: typeof input.roll === "number" ? input.roll : null,
    pitch: typeof input.pitch === "number" ? input.pitch : null,
    yaw: typeof input.yaw === "number" ? input.yaw : null,
    ax: typeof input.ax === "number" ? input.ax : null,
    ay: typeof input.ay === "number" ? input.ay : null,
    az: typeof input.az === "number" ? input.az : null,
    gx: typeof input.gx === "number" ? input.gx : null,
    gy: typeof input.gy === "number" ? input.gy : null,
    gz: typeof input.gz === "number" ? input.gz : null,
    flexionAngle: typeof input.flexionAngle === "number" ? input.flexionAngle : null,
    extensionAngle: typeof input.extensionAngle === "number" ? input.extensionAngle : null,
    confidence,
    batteryLevel: typeof input.batteryLevel === "number" ? input.batteryLevel : device?.batteryLevel ?? null,
    signalStrength: typeof input.signalStrength === "number" ? input.signalStrength : device?.signalStrength ?? null,
    kneeAngleMode,
    clinicalEligible: isClinicalKneeAngle(confidence),
  };

  state.sensorSamples = [sample, ...state.sensorSamples].slice(0, MAX_DEMO_SENSOR_SAMPLES);

  if (typeof input.flexionAngle === "number" && isClinicalKneeAngle(input.confidence)) {
    const nearbyRecord = state.records.find((record) => (
      record.patientId === input.patientId
      && record.source === source
      && !shouldMaterializeClinicalRecord(now, record.recordedAt)
    ));

    if (!nearbyRecord) {
      const knee = addDemoKneeRecord({
        patientId: input.patientId,
        flexionAngle: input.flexionAngle,
        extensionAngle: input.extensionAngle ?? 0,
        activityFrequency: 1,
        activityDuration: 1,
        painScore: 0,
        batteryLevel: input.batteryLevel ?? device?.batteryLevel ?? 92,
        signalStrength: input.signalStrength ?? device?.signalStrength ?? 96,
        source,
        recordedAt: now,
        assessmentScope: "rom-only",
      });

      return { sample, record: knee.record, alert: knee.alert, duplicate: false };
    }
  }

  return { sample, record: null, alert: null, duplicate: false };
}

export function getDemoSensorSamples(patientId: string, limit = 40) {
  const state = getState();
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return state.sensorSamples
    .filter((sample) => sample.patientId === patientId)
    .slice(0, safeLimit);
}

export function getDemoSensorLiveSnapshot(patientId: string) {
  const samples = getDemoSensorSamples(patientId, 80);
  const latestByPlacement = {
    THIGH: samples.find((sample) => sample.placement === "THIGH") ?? null,
    SHANK: samples.find((sample) => sample.placement === "SHANK") ?? null,
    BRACE: samples.find((sample) => sample.placement === "BRACE") ?? null,
    UNKNOWN: samples.find((sample) => sample.placement === "UNKNOWN") ?? null,
  };
  const latest = samples[0] ?? null;
  const dualActive = Boolean(latestByPlacement.THIGH && latestByPlacement.SHANK);
  const dashboard = getDemoDashboardData();
  const clinicalRecords = dashboard.records
    .filter((record) => record.patientId === patientId)
    .slice(-12);
  const patient = dashboard.patients.find((item) => item.id === patientId);
  const metrics = calculateRehabMetrics({
    samples,
    clinicalRecords,
    targetFlexion: patient?.targetFlexion,
  });

  return {
    patientId,
    updatedAt: latest?.recordedAt ?? new Date().toISOString(),
    sampleCount: samples.length,
    dualActive,
    mode: latest?.kneeAngleMode ?? (dualActive ? "DUAL_SENSOR" : latest ? "SINGLE_SENSOR_PROVISIONAL" : "UNKNOWN"),
    latest,
    latestByPlacement,
    samples,
    clinicalRecords,
    metrics,
  };
}

export function addDemoCalibrationRecord(input: CalibrationInput) {
  const state = getState();
  const record = {
    id: createId("calibration"),
    patientId: input.patientId,
    sessionId: input.sessionId ?? null,
    thighDeviceId: input.thighDeviceId ?? null,
    shankDeviceId: input.shankDeviceId ?? null,
    quality: input.quality ?? "GOOD",
    zeroFlexionAngle: input.zeroFlexionAngle ?? 0,
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
  } satisfies CalibrationRecordItem;

  state.calibrationRecords = [record, ...state.calibrationRecords].slice(0, 20);
  return record;
}

export function getDemoCalibrationRecords(patientId: string) {
  const state = getState();
  return state.calibrationRecords.filter((record) => record.patientId === patientId);
}
