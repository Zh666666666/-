import assert from "node:assert/strict";
import test from "node:test";

import { buildAiProviderEvidence } from "./ai-evidence";

test("removes patient, device, session identifiers and absolute dates from provider evidence", () => {
  const evidence = buildAiProviderEvidence({
    targetFlexion: 110,
    surgicalSide: "LEFT",
    sessionStatus: "COMPLETED",
    sessionStartedAt: new Date("2026-07-24T10:00:00.000Z"),
    sessionEndedAt: new Date("2026-07-24T10:02:00.000Z"),
    metrics: { qualityScore: 91 },
    samples: [{
      recordedAt: "2026-07-24T10:00:01.250Z",
      placement: "THIGH",
      roll: 1,
      pitch: 2,
      yaw: 3,
      ax: 0.1,
      ay: 0.2,
      az: 0.3,
      gx: 4,
      gy: 5,
      gz: 6,
      flexionAngle: 42,
    }],
  });

  assert.equal(evidence.session.durationSeconds, 120);
  assert.equal(evidence.rawEvidence[0].offsetSeconds, 1.25);
  assert.equal(evidence.rawEvidence[0].kneeAngle, 42);

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /patient-|device-|session-/i);
  assert.doesNotMatch(serialized, /2026-07-24/);
  assert.doesNotMatch(serialized, /recordedAt|startedAt|endedAt/);
});
