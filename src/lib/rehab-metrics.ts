import type { KneeDataPoint, SensorSampleItem } from "@/lib/rehab";

export type MetricRiskLevel = "INSUFFICIENT_DATA" | "STABLE" | "WATCH" | "HIGH";
export type MetricWarningSeverity = "INFO" | "WATCH" | "HIGH";
export type MeasurementStatus = "READY" | "COLLECTING" | "SETUP_REQUIRED" | "TECHNICAL_ISSUE";

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
    synchronizedPairs: number;
    pairGapP95Ms: number | null;
    observationSeconds: number;
    samplingRegularityPercent: number;
    motionPlausibilityPercent: number;
    calibrationStatus: "GOOD" | "MISSING" | "MISMATCHED" | "NOT_GOOD";
    measurementStatus: MeasurementStatus;
    reasonCodes: string[];
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
  calibration?: {
    quality: "PENDING" | "GOOD" | "FAIR" | "POOR";
    thighDeviceId: string | null;
    shankDeviceId: string | null;
  } | null;
  now?: Date;
};

type SynchronizedPair = {
  at: number;
  gapMs: number;
  flexionAngle: number;
  confidence: number;
  thighDeviceId: string | null;
  shankDeviceId: string | null;
  representative: SensorSampleItem;
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

function buildSynchronizedPairs(samples: SensorSampleItem[]) {
  const eligible = samples.filter((sample) => (
    sample.source === "HARDWARE"
    && sample.clinicalEligible
    && sample.kneeAngleMode === "DUAL_SENSOR"
    && typeof sample.flexionAngle === "number"
    && typeof sample.confidence === "number"
    && sample.confidence >= 0.7
    && Number.isFinite(new Date(sample.recordedAt).getTime())
  ));
  const thighs = eligible.filter((sample) => sample.placement === "THIGH");
  const shanks = eligible.filter((sample) => sample.placement === "SHANK");
  const usedShanks = new Set<number>();
  const pairs: SynchronizedPair[] = [];

  for (const thigh of thighs) {
    const thighAt = new Date(thigh.recordedAt).getTime();
    let bestIndex = -1;
    let bestGap = Number.POSITIVE_INFINITY;

    shanks.forEach((shank, index) => {
      if (usedShanks.has(index)) return;
      if (thigh.sessionId && shank.sessionId && thigh.sessionId !== shank.sessionId) return;
      const gap = Math.abs(new Date(shank.recordedAt).getTime() - thighAt);
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = index;
      }
    });

    if (bestIndex < 0 || bestGap > 200) continue;
    const shank = shanks[bestIndex];
    usedShanks.add(bestIndex);
    pairs.push({
      at: Math.max(thighAt, new Date(shank.recordedAt).getTime()),
      gapMs: bestGap,
      flexionAngle: ((thigh.flexionAngle as number) + (shank.flexionAngle as number)) / 2,
      confidence: Math.min(thigh.confidence as number, shank.confidence as number),
      thighDeviceId: thigh.deviceId,
      shankDeviceId: shank.deviceId,
      representative: new Date(shank.recordedAt).getTime() >= thighAt ? shank : thigh,
    });
  }

  return pairs.sort((a, b) => a.at - b.at);
}

function samplingRegularity(pairs: SynchronizedPair[]) {
  if (pairs.length < 2) return 0;
  const gaps = pairs.slice(1).map((pair, index) => pair.at - pairs[index].at).filter((gap) => gap > 0);
  if (!gaps.length) return 0;
  const medianGap = quantile(gaps, 0.5) ?? 0;
  const maximumRegularGap = Math.max(1_000, medianGap * 3);
  return gaps.filter((gap) => gap <= maximumRegularGap && gap <= 2_000).length / gaps.length;
}

function motionPlausibility(pairs: SynchronizedPair[]) {
  if (pairs.length < 2) return 0;
  let checked = 0;
  let plausible = 0;
  for (let index = 1; index < pairs.length; index += 1) {
    const deltaSeconds = (pairs[index].at - pairs[index - 1].at) / 1_000;
    if (deltaSeconds <= 0 || deltaSeconds > 2) continue;
    checked += 1;
    const angularRate = Math.abs(pairs[index].flexionAngle - pairs[index - 1].flexionAngle) / deltaSeconds;
    if (angularRate <= 300) plausible += 1;
  }
  return checked ? plausible / checked : 0;
}

function resolveCalibrationStatus(
  calibration: MetricInput["calibration"],
  pairs: SynchronizedPair[],
): RehabMetrics["dataQuality"]["calibrationStatus"] {
  if (!calibration) return "MISSING";
  if (calibration.quality !== "GOOD") return "NOT_GOOD";
  if (!calibration.thighDeviceId || !calibration.shankDeviceId) return "MISMATCHED";
  const thighIds = new Set(pairs.map((pair) => pair.thighDeviceId).filter(Boolean));
  const shankIds = new Set(pairs.map((pair) => pair.shankDeviceId).filter(Boolean));
  if (!thighIds.has(calibration.thighDeviceId) || !shankIds.has(calibration.shankDeviceId)) return "MISMATCHED";
  return "GOOD";
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
      placement: sample.placement,
      acceleration: vectorMagnitude(sample.ax, sample.ay, sample.az),
      angularVelocity: vectorMagnitude(sample.gx, sample.gy, sample.gz),
    }))
    .filter((sample) => Number.isFinite(sample.at) && sample.acceleration !== null && sample.angularVelocity !== null)
    .sort((a, b) => a.at - b.at);

  for (let start = 0; start < hardware.length; start += 1) {
    const window = hardware.filter((sample) => (
      sample.placement === hardware[start].placement
      && sample.at >= hardware[start].at
      && sample.at - hardware[start].at <= 1_200
    ));
    if (window.length < 3) continue;
    const lowIndex = window.findIndex((sample) => (sample.acceleration as number) < 0.8);
    if (lowIndex < 0) continue;
    const impactIndex = window.findIndex((sample, index) => (
      index > lowIndex && (sample.acceleration as number) >= 3
    ));
    if (impactIndex < 0) continue;
    const rotationIndex = window.findIndex((sample, index) => (
      index >= impactIndex && (sample.angularVelocity as number) >= 500
    ));
    if (rotationIndex < 0) continue;

    return {
      placement: hardware[start].placement,
      minimumAcceleration: window[lowIndex].acceleration as number,
      peakAcceleration: Math.max(
        ...window.slice(impactIndex, rotationIndex + 1).map((sample) => sample.acceleration as number),
      ),
      peakAngularVelocity: Math.max(
        ...window.slice(impactIndex, rotationIndex + 1).map((sample) => sample.angularVelocity as number),
      ),
    };
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
  calibration = null,
  now = new Date(),
}: MetricInput): RehabMetrics {
  const target = clamp(targetFlexion ?? 110, 60, 150);
  const ordered = [...samples].sort((a, b) => (
    new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  ));
  const candidateAngles = ordered.filter((sample) => typeof sample.flexionAngle === "number");
  const synchronizedPairs = buildSynchronizedPairs(ordered);
  const pairedSamples = synchronizedPairs.map((pair) => ({
    ...pair.representative,
    recordedAt: new Date(pair.at).toISOString(),
    flexionAngle: pair.flexionAngle,
    confidence: pair.confidence,
  }));
  const confidences = synchronizedPairs.map((pair) => pair.confidence);
  const latestTimestamp = ordered.at(-1)?.recordedAt;
  const freshnessSeconds = latestTimestamp
    ? Math.max(0, (now.getTime() - new Date(latestTimestamp).getTime()) / 1000)
    : null;
  const meanConfidence = mean(confidences);
  const eligibleRatio = candidateAngles.length ? (synchronizedPairs.length * 2) / candidateAngles.length : 0;
  const freshnessFactor = freshnessSeconds === null ? 0 : clamp(1 - freshnessSeconds / 30, 0, 1);
  const observationSeconds = synchronizedPairs.length >= 2
    ? (synchronizedPairs.at(-1)!.at - synchronizedPairs[0].at) / 1_000
    : 0;
  const regularity = samplingRegularity(synchronizedPairs);
  const plausibility = motionPlausibility(synchronizedPairs);
  const pairGapP95Ms = quantile(synchronizedPairs.map((pair) => pair.gapMs), 0.95);
  const calibrationStatus = resolveCalibrationStatus(calibration, synchronizedPairs);
  const repetitionsBeforeGate = countRepetitions(synchronizedPairs.map((pair) => pair.flexionAngle));
  const reasonCodes: string[] = [];
  if (resolveProvenance(ordered) !== "HARDWARE") reasonCodes.push("NOT_HARDWARE");
  if (synchronizedPairs.length < 6) reasonCodes.push("TOO_FEW_SYNCHRONIZED_PAIRS");
  if (observationSeconds < 3) reasonCodes.push("OBSERVATION_TOO_SHORT");
  if (pairGapP95Ms === null || pairGapP95Ms > 200) reasonCodes.push("PAIR_SYNC_FAILED");
  if (regularity < 0.7) reasonCodes.push("IRREGULAR_SAMPLING");
  if (plausibility < 0.8) reasonCodes.push("IMPLAUSIBLE_MOTION");
  if (repetitionsBeforeGate < 1) reasonCodes.push("NO_COMPLETE_MOVEMENT_CYCLE");
  const qualityScore = Math.round(
    (meanConfidence ?? 0) * 25
    + clamp(eligibleRatio, 0, 1) * 20
    + freshnessFactor * 15
    + clamp(synchronizedPairs.length / 20, 0, 1) * 10
    + clamp(observationSeconds / 8, 0, 1) * 10
    + regularity * 10
    + plausibility * 10,
  );
  if (qualityScore < 70) reasonCodes.push("QUALITY_SCORE_LOW");
  const clinicalEligible = reasonCodes.length === 0;
  const measurementStatus: MeasurementStatus = clinicalEligible
    ? "READY"
    : synchronizedPairs.length < 6 || observationSeconds < 3 || repetitionsBeforeGate < 1
        ? "COLLECTING"
        : "TECHNICAL_ISSUE";
  const angles = synchronizedPairs.map((pair) => pair.flexionAngle);
  const hasObservableMeasurement = synchronizedPairs.length >= 2 && observationSeconds >= 1;
  const minimumFlexion = hasObservableMeasurement ? quantile(angles, 0.05) : null;
  const peakFlexion = hasObservableMeasurement ? quantile(angles, 0.95) : null;
  const rom = minimumFlexion !== null && peakFlexion !== null ? Math.max(0, peakFlexion - minimumFlexion) : null;
  const activeDurationSeconds = hasObservableMeasurement ? calculateActiveDuration(pairedSamples) : null;
  const repetitions = hasObservableMeasurement ? repetitionsBeforeGate : null;
  const cadence = repetitions !== null && activeDurationSeconds !== null && activeDurationSeconds >= 10
    ? repetitions / (activeDurationSeconds / 60)
    : null;

  const orderedRecords = [...clinicalRecords]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
  const recordSpanMs = orderedRecords.length >= 2
    ? new Date(orderedRecords.at(-1)!.recordedAt).getTime() - new Date(orderedRecords[0].recordedAt).getTime()
    : 0;
  const recordAngles = orderedRecords.map((record) => record.flexionAngle);
  const recentFlexion = mean(recordAngles.slice(-3));
  const previousFlexion = recordAngles.length >= 6 && recordSpanMs >= 12 * 60 * 60 * 1_000
    ? mean(recordAngles.slice(-6, -3))
    : null;
  const trendChange = recentFlexion !== null && previousFlexion !== null ? recentFlexion - previousFlexion : null;
  const latestPain = [...clinicalRecords]
    .filter((record) => record.source === "MANUAL")
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .at(0)?.painScore ?? null;

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
  if (latestPain !== null && latestPain >= 7) {
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
      title: "检测到一次较强晃动",
      evidence: `${possibleFall.placement === "THIGH" ? "大腿" : possibleFall.placement === "SHANK" ? "小腿" : "同一"}设备在 1.2 秒内出现低加速度 ${round(possibleFall.minimumAcceleration, 2)}g、冲击 ${round(possibleFall.peakAcceleration, 2)}g、峰值角速度 ${round(possibleFall.peakAngularVelocity, 0)}°/s。`,
      action: "请先确认家人是否安全、有无疼痛或跌倒；这只是实验性冲击筛查，不能判断是否真的跌倒。",
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
  if (latestPain !== null && latestPain > 3) {
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
  const riskLevel: MetricRiskLevel = riskScore === null
    ? "INSUFFICIENT_DATA"
    : possibleFallWarning
      ? "HIGH"
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
      eligibleSamples: synchronizedPairs.length * 2,
      candidateSamples: candidateAngles.length,
      meanConfidence: meanConfidence === null ? null : round(meanConfidence, 2),
      freshnessSeconds: freshnessSeconds === null ? null : round(freshnessSeconds, 0),
      synchronizedPairs: synchronizedPairs.length,
      pairGapP95Ms: pairGapP95Ms === null ? null : round(pairGapP95Ms, 0),
      observationSeconds: round(observationSeconds, 1),
      samplingRegularityPercent: round(regularity * 100, 0),
      motionPlausibilityPercent: round(plausibility * 100, 0),
      calibrationStatus,
      measurementStatus,
      reasonCodes,
      formula: "Q=25×成对置信度+20×双路配对覆盖+15×新鲜度+10×成对样本量+10×观察时长+10×采样连续性+10×动作合理性；真实硬件、配对误差≤200ms、至少6对/3秒且出现完整屈伸周期用于决定置信度。软件零点校准会提高可比性，但不作为是否生成结果的硬门槛。",
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
      formula: "关注优先级=目标差距(0-30)+伸直差距(0-15)+趋势回退(0-20)+人工疼痛记录(0-20)+重复不足(0-15)；它不是并发症概率或医学严重程度。质量门通过时，实验性冲击筛查将优先级下限提高到75。",
    },
    warnings,
    safetyBoundary: [
      "本结果用于康复监测与分诊提示，不构成诊断或自动处方。",
      "单传感器、配对不同步或没有完整动作周期时，系统仍保存训练记录，但结果会明确标记为低置信度或数据不足，不把技术问题算作患者风险。",
      "膝部 IMU 无法识别发热、切口渗液、单侧小腿肿痛、胸痛或呼吸困难；这些症状必须由患者主动报告并人工处置。",
      "较强晃动规则仅是同一设备内的实验性冲击筛查；设备安装位置和动作场景不同，必须经过真实人群验证后才能升级为正式告警。",
      "当前网关角度仍是双传感器 Pitch 差值预览；在四元数相对姿态和功能轴校准落地前，本结果只用于训练监测，不作为临床量角器替代。",
    ],
  };
}
