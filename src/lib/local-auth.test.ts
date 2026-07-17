import assert from "node:assert/strict";
import test from "node:test";

import { createLocalSession, secretsEqual, verifyLocalSession } from "./local-auth";

const secret = "test-session-secret-that-is-at-least-32-chars";

test("creates and verifies a role-bound local session", async () => {
  const token = await createLocalSession("nurse", secret, 1_000);
  assert.deepEqual(await verifyLocalSession(token, secret, 2_000), {
    role: "nurse",
    expiresAt: 1_000 + 12 * 60 * 60 * 1000,
  });
});

test("rejects tampered and expired local sessions", async () => {
  const token = await createLocalSession("family", secret, 1_000);
  assert.equal(await verifyLocalSession(`${token}x`, secret, 2_000), null);
  assert.equal(await verifyLocalSession(token, secret, 1_000 + 12 * 60 * 60 * 1000), null);
});

test("compares local credentials without exposing the original values", async () => {
  assert.equal(await secretsEqual("same-value", "same-value"), true);
  assert.equal(await secretsEqual("same-value", "other-value"), false);
});
