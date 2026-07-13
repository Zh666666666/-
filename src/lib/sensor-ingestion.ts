export const minimumClinicalConfidence = 0.7;
export const clinicalRecordIntervalMs = 10_000;
export const alertCooldownMs = 30 * 60_000;

export function isClinicalKneeAngle(confidence: number | null | undefined) {
  return typeof confidence === "number" && confidence >= minimumClinicalConfidence;
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
