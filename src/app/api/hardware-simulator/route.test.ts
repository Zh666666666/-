import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";

test("does not expose the hardware simulator in production", async () => {
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "production";
  try {
    const response = await POST(new Request("https://care.example/api/hardware-simulator", {
      method: "POST",
      body: JSON.stringify({ patientId: "patient-1" }),
    }));
    assert.equal(response.status, 404);
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});
