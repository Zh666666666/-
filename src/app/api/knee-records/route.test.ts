import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";

test("rejects browser claims that a generic knee record came from hardware", async () => {
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "production";
  try {
    const response = await POST(new Request("https://care.example/api/knee-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patientId: "patient-1",
        flexionAngle: 90,
        activityFrequency: 5,
        activityDuration: 10,
        source: "HARDWARE",
      }),
    }));
    assert.equal(response.status, 403);
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});
