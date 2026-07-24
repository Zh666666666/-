type ProviderSample = {
  recordedAt: string;
  placement: string;
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
};

type ProviderEvidenceInput = {
  targetFlexion: number;
  surgicalSide: string;
  sessionStatus: string;
  sessionStartedAt: Date;
  sessionEndedAt: Date | null;
  metrics: unknown;
  samples: ProviderSample[];
};

export function buildAiProviderEvidence(input: ProviderEvidenceInput) {
  const startedAtMs = input.sessionStartedAt.getTime();
  const durationSeconds = input.sessionEndedAt
    ? Math.max(0, (input.sessionEndedAt.getTime() - startedAtMs) / 1000)
    : null;

  return {
    boundary: "工程康复分析，非疾病诊断，不替代医生或治疗处方",
    privacy: "证据已去标识化，不包含患者、设备、会话标识或绝对日期",
    patientContext: {
      targetFlexion: input.targetFlexion,
      surgicalSide: input.surgicalSide,
    },
    session: {
      status: input.sessionStatus,
      durationSeconds,
    },
    metrics: input.metrics,
    rawEvidence: input.samples.map((sample) => ({
      offsetSeconds: Math.max(0, (new Date(sample.recordedAt).getTime() - startedAtMs) / 1000),
      placement: sample.placement,
      roll: sample.roll,
      pitch: sample.pitch,
      yaw: sample.yaw,
      ax: sample.ax,
      ay: sample.ay,
      az: sample.az,
      gx: sample.gx,
      gy: sample.gy,
      gz: sample.gz,
      kneeAngle: sample.flexionAngle,
    })),
  };
}
