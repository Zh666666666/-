export const minimumClinicalConfidence = 0.7;
export const clinicalRecordIntervalMs = 10_000;
export const alertCooldownMs = 30 * 60_000;

type ClinicalPairSample = {
  source: string;
  placement: string;
  deviceId: string | null | undefined;
  recordedAt: Date | string;
  flexionAngle: number | null | undefined;
  confidence: number | null | undefined;
  kneeAngleMode: string | null | undefined;
};

type ClinicalPairCalibration = {
  quality: string;
  thighDeviceId: string | null | undefined;
  shankDeviceId: string | null | undefined;
} | null | undefined;

export function isClinicalKneeAngle(confidence: number | null | undefined) {
  return typeof confidence === "number" && confidence >= minimumClinicalConfidence;
}

export function resolveTrustedClinicalPairAngle({
  current,
  opposite,
  calibration,
  currentBindingMatches,
}: {
  current: ClinicalPairSample;
  opposite: ClinicalPairSample | null | undefined;
  calibration: ClinicalPairCalibration;
  currentBindingMatches: boolean;
}) {
  if (
    !opposite
    || !currentBindingMatches
    || current.source !== "HARDWARE"
    || opposite.source !== "HARDWARE"
    || calibration?.quality !== "GOOD"
    || current.kneeAngleMode !== "DUAL_SENSOR"
    || opposite.kneeAngleMode !== "DUAL_SENSOR"
    || !isClinicalKneeAngle(current.confidence)
    || !isClinicalKneeAngle(opposite.confidence)
    || typeof current.flexionAngle !== "number"
    || typeof opposite.flexionAngle !== "number"
  ) {
    return null;
  }

  const isThighToShank = current.placement === "THIGH" && opposite.placement === "SHANK";
  const isShankToThigh = current.placement === "SHANK" && opposite.placement === "THIGH";
  if (!isThighToShank && !isShankToThigh) return null;

  const expectedCurrentDevice = current.placement === "THIGH"
    ? calibration.thighDeviceId
    : calibration.shankDeviceId;
  const expectedOppositeDevice = opposite.placement === "THIGH"
    ? calibration.thighDeviceId
    : calibration.shankDeviceId;
  if (!expectedCurrentDevice || !expectedOppositeDevice) return null;
  if (current.deviceId !== expectedCurrentDevice || opposite.deviceId !== expectedOppositeDevice) return null;

  const currentAt = new Date(current.recordedAt).getTime();
  const oppositeAt = new Date(opposite.recordedAt).getTime();
  if (!Number.isFinite(currentAt) || !Number.isFinite(oppositeAt) || Math.abs(currentAt - oppositeAt) > 200) {
    return null;
  }

  return (current.flexionAngle + opposite.flexionAngle) / 2;
}

export function shouldMaterializeClinicalRecord(
  recordedAt: Date | string,
  nearbyRecordedAt: Date | string | null | undefined,
) {
  if (!nearbyRecordedAt) {
    return true;
  }

  const current = new Date(recordedAt).getTime();
  const nearby = new Date(nearbyRecordedAt).getTime();

  if (!Number.isFinite(current) || !Number.isFinite(nearby)) {
    return false;
  }

  return Math.abs(current - nearby) >= clinicalRecordIntervalMs;
}
