import type { KneeDataPoint, SensorSampleItem } from "@/lib/rehab";

export type MetricRiskLevel = "INSUFFICIENT_DATA" | "STABLE" | "WATCH" | "HIGH";
export type MetricWarningSeverity = "INFO" | "WATCH" | "HIGH";

export type RehabMetricWarning = {
  code: "DATA_STALE" | "ROM_REGRESSION" | "PAIN_HIGH" | "POSSIBLE_FALL_IMPACT";
  severity: MetricWarningSeverity;
  title: string;
  evidence: string;
  action: string;
  requiresHumanConfirmation: boolean;
};

export type RehabMetrics = {
  generatedAt: string;
  clinicalEligible: boolean;
  provenance: "HARDWARE" | "DEMO" | "MIXED" | "UNKNOWN";
  dataQuality: {
    score: number;
    label: "INSUFFICIENT" | "FAIR" | "GOOD";
    eligibleSamples: number;
    candidateSamples: number;
    meanConfidence: number | null;
    freshnessSeconds: number | null;
    formula: string;
  };
  rom: {
    value: number | null;
    minimumFlexion: number | null;
    peakFlexion: number | null;
    extensionDeficit: number | null;
    targetFlexion: number;
    targetCompletionPercent: number | null;
    formula: string;
  };
  training: {
    repetitions: number | null;
    activeDurationSeconds: number | null;
    cadencePerMinute: number | null;
    formula: string;
  };
  trend: {
    recentFlexion: number | null;
    previousFlexion: number | null;
    changeDegrees: number | null;
    formula: string;
  };
  risk: {
    score: number | null;
    level: MetricRiskLevel;
    factors: Array<{ name: string; points: number; evidence: string }>;
    formula: string;
  };
  warnings: RehabMetricWarning[];
  safetyBoundary: string[];
};

type MetricInput = {
  samples: SensorSampleItem[];
  clinicalRecords: KneeDataPoint[];
  targetFlexion?: number | null;
  now?: Date;
};

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

function quantile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function vectorMagnitude(x: number | null, y: number | null, z: number | null) {
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
}

function movingMedian(values: number[]) {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - 1), Math.min(values.length, index + 2));
    return quantile(window, 0.5) ?? values[index];
  });
}

function countRepetitions(angles: number[]) {
  if (angles.length < 5) return 0;
  const smoothed = movingMedian(angles);
  const low = quantile(smoothed, 0.1) ?? 0;
  const high = quantile(smoothed, 0.9) ?? low;
  const amplitude = high - low;
  if (amplitude < 15) return 0;

  const peakThreshold = low + Math.max(15, amplitude * 0.6);
  const returnThreshold = low + Math.max(8, amplitude * 0.3);
  let armed = true;
  let repetitions = 0;

  for (const angle of smoothed) {
    if (armed && angle >= peakThreshold) {
      repetitions += 1;
      armed = false;
    } else if (!armed && angle <= returnThreshold) {
      armed = true;
    }
  }

  return repetitions;
}

function calculateActiveDuration(samples: SensorSampleItem[]) {
  if (samples.length < 2) return 0;
  let activeMs = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const deltaMs = new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime();
    if (deltaMs <= 0 || deltaMs > 2_000) continue;

    const angleMotion = typeof previous.flexionAngle === "number" && typeof current.flexionAngle === "number"
      ? Math.abs(current.flexionAngle - previous.flexionAngle)
      : 0;
    const gyro = vectorMagnitude(current.gx, current.gy, current.gz) ?? 0;
    if (angleMotion >= 2 || gyro >= 10) activeMs += deltaMs;
  }

  return activeMs / 1000;
}

function detectPossibleFallImpact(samples: SensorSampleItem[]) {
  const hardware = samples
    .filter((sample) => sample.source === "HARDWARE")
    .map((sample) => ({
      at: new Date(sample.recordedAt).getTime(),
      acceleration: vectorMagnitude(sample.ax, sample.ay, sample.az),
      angularVelocity: vectorMagnitude(sample.gx, sample.gy, sample.gz),
    }))
    .filter((sample) => Number.isFinite(sample.at) && sample.acceleration !== null && sample.angularVelocity !== null)
    .sort((a, b) => a.at - b.at);

  for (let start = 0; start < hardware.length; start += 1) {
    const window = hardware.filter((sample) => sample.at >= hardware[start].at && sample.at - hardware[start].at <= 1_200);
    const accelerations = window.map((sample) => sample.acceleration as number);
    const angularVelocities = window.map((sample) => sample.angularVelocity as number);
    if (
      Math.min(...accelerations) < 0.8
      && Math.max(...accelerations) > 2.5
      && Math.max(...angularVelocities) > 80
    ) {
      return {
        minimumAcceleration: Math.min(...accelerations),
        peakAcceleration: Math.max(...accelerations),
        peakAngularVelocity: Math.max(...angularVelocities),
      };
    }
  }

  return null;
}

function resolveProvenance(samples: SensorSampleItem[]): RehabMetrics["provenance"] {
  const sources = new Set(samples.map((sample) => sample.source));
  if (sources.size === 0) return "UNKNOWN";
  if (sources.size > 1) return "MIXED";
  return sources.has("HARDWARE") ? "HARDWARE" : sources.has("DEMO") ? "DEMO" : "MIXED";
}

export function calculateRehabMetrics({
  samples,
  clinicalRecords,
  targetFlexion = 110,
  now = new Date(),
}: MetricInput): RehabMetrics {
  const target = clamp(targetFlexion ?? 110, 60, 150);
  const ordered = [...samples].sort((a, b) => (
    new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  ));
  const candidateAngles = ordered.filter((sample) => typeof sample.flexionAngle === "number");
  const eligible = candidateAngles.filter((sample) => (
    sample.clinicalEligible
    && sample.kneeAngleMode === "DUAL_SENSOR"
    && typeof sample.confidence === "number"
    && sample.confidence >= 0.7
  ));
  const confidences = eligible.map((sample) => sample.confidence as number);
  const latestTimestamp = ordered.at(-1)?.recordedAt;
  const freshnessSeconds = latestTimestamp
    ? Math.max(0, (now.getTime() - new Date(latestTimestamp).getTime()) / 1000)
    : null;
  const meanConfidence = mean(confidences);
  const eligibleRatio = candidateAngles.length ? eligible.length / candidateAngles.length : 0;
  const freshnessFactor = freshnessSeconds === null ? 0 : clamp(1 - freshnessSeconds / 120, 0, 1);
  const qualityScore = Math.round(
    (meanConfidence ?? 0) * 45
    + eligibleRatio * 25
    + freshnessFactor * 15
    + clamp(eligible.length / 30, 0, 1) * 15,
  );
  const clinicalEligible = eligible.length >= 5 && qualityScore >= 55;
  const angles = eligible.map((sample) => sample.flexionAngle as number);
  const minimumFlexion = clinicalEligible ? quantile(angles, 0.05) : null;
  const peakFlexion = clinicalEligible ? quantile(angles, 0.95) : null;
  const rom = minimumFlexion !== null && peakFlexion !== null ? Math.max(0, peakFlexion - minimumFlexion) : null;
  const activeDurationSeconds = clinicalEligible ? calculateActiveDuration(eligible) : null;
  const repetitions = clinicalEligible ? countRepetitions(angles) : null;
  const cadence = repetitions !== null && activeDurationSeconds !== null && activeDurationSeconds >= 10
    ? repetitions / (activeDurationSeconds / 60)
    : null;

  const recordAngles = [...clinicalRecords]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .map((record) => record.flexionAngle);
  const recentFlexion = mean(recordAngles.slice(-3));
  const previousFlexion = recordAngles.length >= 6 ? mean(recordAngles.slice(-6, -3)) : null;
  const trendChange = recentFlexion !== null && previousFlexion !== null ? recentFlexion - previousFlexion : null;
  const latestPain = [...clinicalRecords]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .at(0)?.painScore ?? 0;

  const warnings: RehabMetricWarning[] = [];
  if (freshnessSeconds !== null && freshnessSeconds > 30) {
    warnings.push({
      code: "DATA_STALE",
      severity: "WATCH",
      title: "传感器数据已中断",
      evidence: `最近样本距今 ${Math.round(freshnessSeconds)} 秒，超过 30 秒运行阈值。`,
      action: "检查手机蓝牙、网关采集状态、网络和离线队列。",
      requiresHumanConfirmation: false,
    });
  }
  if (trendChange !== null && trendChange <= -10) {
    warnings.push({
      code: "ROM_REGRESSION",
      severity: trendChange <= -15 ? "HIGH" : "WATCH",
      title: "屈曲趋势出现回退",
      evidence: `最近 3 个临床点均值较此前 3 个下降 ${Math.abs(round(trendChange))}°。`,
      action: "护士复核疼痛、肿胀、测量姿势和传感器校准，不以单次结果调整处方。",
      requiresHumanConfirmation: true,
    });
  }
  if (latestPain >= 7) {
    warnings.push({
      code: "PAIN_HIGH",
      severity: "HIGH",
      title: "患者报告疼痛较高",
      evidence: `最近一次疼痛评分为 ${latestPain}/10。`,
      action: "暂停自行加量并联系护士或医生评估；若伴胸痛、呼吸困难等急症表现应立即急救。",
      requiresHumanConfirmation: true,
    });
  }
  const possibleFall = detectPossibleFallImpact(ordered);
  if (possibleFall) {
    warnings.push({
      code: "POSSIBLE_FALL_IMPACT",
      severity: "HIGH",
      title: "疑似跌倒或强冲击事件",
      evidence: `1.2 秒窗内出现低加速度 ${round(possibleFall.minimumAcceleration, 2)}g、冲击 ${round(possibleFall.peakAcceleration, 2)}g、峰值角速度 ${round(possibleFall.peakAngularVelocity, 0)}°/s。`,
      action: "立即联系患者确认意识、疼痛和是否跌倒；该规则为膝部 IMU 实验性筛查，不能单独确诊。",
      requiresHumanConfirmation: true,
    });
  }

  const factors: RehabMetrics["risk"]["factors"] = [];
  if (clinicalEligible && peakFlexion !== null && minimumFlexion !== null) {
    const targetGap = Math.max(0, target - peakFlexion);
    const points = round(clamp(targetGap / 30, 0, 1) * 30, 0);
    if (points > 0) factors.push({ name: "目标屈曲差距", points, evidence: `P95 ${round(peakFlexion)}°，个体目标 ${target}°` });

    const extensionDeficit = Math.max(0, minimumFlexion);
    const extensionPoints = round(clamp(extensionDeficit / 15, 0, 1) * 15, 0);
    if (extensionPoints > 0) factors.push({ name: "伸直缺失", points: extensionPoints, evidence: `P05 ${round(minimumFlexion)}°` });
  }
  if (trendChange !== null && trendChange < 0) {
    const points = round(clamp(Math.abs(trendChange) / 15, 0, 1) * 20, 0);
    if (points > 0) factors.push({ name: "近期趋势回退", points, evidence: `${round(trendChange)}°` });
  }
  if (latestPain > 3) {
    const points = round(clamp((latestPain - 3) / 7, 0, 1) * 20, 0);
    if (points > 0) factors.push({ name: "疼痛负担", points, evidence: `${latestPain}/10` });
  }
  if (activeDurationSeconds !== null && activeDurationSeconds >= 60 && (repetitions ?? 0) < 3) {
    factors.push({ name: "有效重复不足", points: 15, evidence: `${repetitions ?? 0} 次 / ${round(activeDurationSeconds, 0)} 秒活动` });
  }

  const possibleFallWarning = warnings.some((warning) => warning.code === "POSSIBLE_FALL_IMPACT");
  let riskScore = clinicalEligible ? Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0)) : null;
  if (possibleFallWarning && clinicalEligible) {
    riskScore = Math.max(riskScore ?? 0, 75);
  }
  const riskLevel: MetricRiskLevel = possibleFallWarning
    ? "HIGH"
    : riskScore === null
    ? "INSUFFICIENT_DATA"
    : riskScore >= 50
      ? "HIGH"
      : riskScore >= 25
        ? "WATCH"
        : "STABLE";

  return {
    generatedAt: now.toISOString(),
    clinicalEligible,
    provenance: resolveProvenance(ordered),
    dataQuality: {
      score: qualityScore,
      label: clinicalEligible ? (qualityScore >= 75 ? "GOOD" : "FAIR") : "INSUFFICIENT",
      eligibleSamples: eligible.length,
      candidateSamples: candidateAngles.length,
      meanConfidence: meanConfidence === null ? null : round(meanConfidence, 2),
      freshnessSeconds: freshnessSeconds === null ? null : round(freshnessSeconds, 0),
      formula: "Q=45×平均置信度+25×双传感器合格率+15×新鲜度+15×样本充分度；至少5个合格样本且Q≥55。",
    },
    rom: {
      value: rom === null ? null : round(rom),
      minimumFlexion: minimumFlexion === null ? null : round(minimumFlexion),
      peakFlexion: peakFlexion === null ? null : round(peakFlexion),
      extensionDeficit: minimumFlexion === null ? null : round(Math.max(0, minimumFlexion)),
      targetFlexion: target,
      targetCompletionPercent: peakFlexion === null ? null : round(clamp(peakFlexion / target, 0, 1.5) * 100, 0),
      formula: "ROM=P95(屈曲角)-P05(屈曲角)；使用分位数抑制瞬时尖峰，伸直缺失=max(0,P05)。",
    },
    training: {
      repetitions,
      activeDurationSeconds: activeDurationSeconds === null ? null : round(activeDurationSeconds, 0),
      cadencePerMinute: cadence === null ? null : round(cadence),
      formula: "三点中值滤波后，以动态幅度阈值识别完整屈伸周期；活动时间仅累计相邻2秒内角度变化≥2°或角速度≥10°/s。",
    },
    trend: {
      recentFlexion: recentFlexion === null ? null : round(recentFlexion),
      previousFlexion: previousFlexion === null ? null : round(previousFlexion),
      changeDegrees: trendChange === null ? null : round(trendChange),
      formula: "趋势变化=最近3个临床点均值-此前3个临床点均值；下降≥10°触发复核。",
    },
    risk: {
      score: riskScore,
      level: riskLevel,
      factors,
      formula: "风险分=目标差距(0-30)+伸直缺失(0-15)+趋势回退(0-20)+疼痛(0-20)+重复不足(0-15)；质量门通过时，疑似跌倒筛查将风险分下限提高到75。",
    },
    warnings,
    safetyBoundary: [
      "本结果用于康复监测与分诊提示，不构成诊断或自动处方。",
      "单传感器、未校准或质量门限未通过时，不输出临床 ROM 与综合风险分。",
      "膝部 IMU 无法识别发热、切口渗液、单侧小腿肿痛、胸痛或呼吸困难；这些症状必须由患者主动报告并人工处置。",
      "疑似跌倒规则来自可穿戴 IMU 研究阈值，但设备安装位置不同，必须经过本产品真实人群验证后才能升级为正式告警。",
    ],
  };
}
