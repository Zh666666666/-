import assert from "node:assert/strict";
import test from "node:test";

import {
  createReviewedEvidenceReport,
  isEvidenceLoopComplete,
  parseLocalEvidencePackage,
  summarizeEvidencePackage,
  type EvidenceReview,
} from "./evidence-package";

function fixture() {
  return parseLocalEvidencePackage({
    schemaVersion: "tka-local-evidence/v1",
    exportedAt: "2026-07-14T10:01:00.000Z",
    session: {
      id: "session-1",
      subjectId: "local-subject",
      status: "COMPLETED",
      source: "HARDWARE",
      sensorModel: "WT9011DCL-BT50",
      appVersion: "0.3.0",
      startedAt: "2026-07-14T10:00:00.000Z",
      endedAt: "2026-07-14T10:00:02.000Z",
      endReason: "USER_FINISHED",
      sampleCount: 2,
      eventCount: 1,
    },
    samples: [0, 1].map((index) => ({
      id: `sample-${index}`,
      recordedAt: `2026-07-14T10:00:0${index}.000Z`,
      deviceId: "BLE-001",
      deviceName: "WT901BLE67",
      placement: "SHANK",
      roll: index * 10,
      pitch: index * 20,
      yaw: index * 5,
      ax: index === 0 ? 0 : 3,
      ay: 0,
      az: index === 0 ? 1 : 0,
      gx: 0,
      gy: index * 320,
      gz: 0,
    })),
    events: [{
      id: "event-1",
      type: "STRONG_MOTION",
      severity: "HIGH",
      status: "OPEN",
      occurredAt: "2026-07-14T10:00:01.000Z",
      title: "检测到强冲击或剧烈运动",
      evidence: "加速度合量 3.00g。",
      requiresAction: true,
    }],
  });
}

test("summarizes a real hardware evidence package", () => {
  const summary = summarizeEvidencePackage(fixture());
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.samplingRateHz, 1);
  assert.equal(summary.maximumAccelerationG, 3);
  assert.equal(summary.maximumAngularVelocityDps, 320);
  assert.equal(summary.pitchRange, 20);
  assert.equal(summary.actionableEvents, 1);
});

test("requires every actionable event to be resolved before closing the loop", () => {
  const evidence = fixture();
  assert.equal(isEvidenceLoopComplete(evidence, {}), false);

  const reviews: Record<string, EvidenceReview> = {
    "event-1": { eventId: "event-1", status: "RESOLVED", note: "已确认设备受到桌面碰撞。", updatedAt: "2026-07-14T10:02:00.000Z" },
  };
  assert.equal(isEvidenceLoopComplete(evidence, reviews), true);
  const report = createReviewedEvidenceReport(evidence, reviews);
  assert.equal(report.loopComplete, true);
  assert.equal(report.eventReviews[0].note, "已确认设备受到桌面碰撞。");
});

test("rejects a package whose declared counts do not match its contents", () => {
  const invalid = JSON.parse(JSON.stringify(fixture()));
  invalid.session.sampleCount = 99;
  assert.throws(() => parseLocalEvidencePackage(invalid), /sampleCount/);
});
