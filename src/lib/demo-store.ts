import {
  assessKneeRecord,
  createInitialRecords,
  seedPatients,
  type AlertItem,
  type AiAnalysisItem,
  type AppointmentItem,
  type AppointmentStatus,
  type DashboardData,
  type KneeDataPoint,
  encodeNursingNotes,
  serializeNursingRecord,
  type NursingRecordItem,
  type NursingSoapFields,
  type ProfileItem,
  type UserRole,
} from "@/lib/rehab";

type DemoNursingRecord = Omit<NursingRecordItem, "soap">;

type DemoState = Omit<DashboardData, "nursingRecords"> & {
  nursingRecords: DemoNursingRecord[];
  profiles: ProfileItem[];
  appointments: AppointmentItem[];
};

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

const globalForDemo = globalThis as unknown as {
  rehabDemoState?: DemoState;
};

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createAlert(record: Pick<KneeDataPoint, "patientId" | "flexionAngle" | "activityFrequency" | "activityDuration" | "painScore">) {
  const assessment = assessKneeRecord(record);

  if (!assessment) {
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
        id: "demo-profile-patient",
        userId: "demo-patient-user",
        role: "patient",
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
    appointments: [
      {
        id: "demo-appointment-1",
        patientName: seedPatients[0].name,
        patientPhone: "13800000001",
        expectedTime: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        description: "希望护士上门评估膝关节肿胀和步态训练情况。",
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
        guidance: "指导患者完成坐位屈膝 3 组，每组 8 次，疼痛超过 6 分时暂停。",
        notes: encodeNursingNotes("患者可理解动作要点，需继续观察屈曲角度。", {
          subjective: "患者诉训练后膝部酸胀，可耐受，无夜间痛加重。",
          objective: "智能护膝显示屈曲角度较前改善，疼痛评分 4 分。",
          assessment: "康复依从性尚可，需继续监测屈曲角度和肿胀趋势。",
          plan: "维持坐位屈膝训练，每 2 小时 1 组，疼痛超过 6 分暂停。",
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
  return globalForDemo.rehabDemoState;
}

export function getDemoDashboardData(): DashboardData {
  const state = getState();

  const patientProfile = state.profiles.find((profile) => profile.role === "patient");
  const patients = state.patients.map((patient, index) => {
    if (index !== 0 || !patientProfile) {
      return patient;
    }

    return {
      ...patient,
      name: patientProfile.name,
      age: patientProfile.age ?? patient.age,
      surgeryDate: patientProfile.tkaSurgeryDate ?? patient.surgeryDate,
      surgicalSide: patientProfile.affectedKnee ?? patient.surgicalSide,
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
    name: input.name ?? (input.role === "patient" ? "演示患者" : "演示护士"),
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

  const alert = createAlert(record);
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
