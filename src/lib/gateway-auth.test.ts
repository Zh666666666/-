import assert from "node:assert/strict";
import test from "node:test";

import { gatewayUnauthorizedResponse, grantAllows, hashGatewayToken, newGatewayToken } from "./gateway-auth";

async function withProductionToken<T>(callback: () => T) {
  const previousMode = process.env.APP_MODE;
  const previousToken = process.env.GATEWAY_API_TOKEN;
  process.env.APP_MODE = "production";
  process.env.GATEWAY_API_TOKEN = "test-gateway-token-24-chars";

  try {
    return await callback();
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
    if (previousToken === undefined) delete process.env.GATEWAY_API_TOKEN;
    else process.env.GATEWAY_API_TOKEN = previousToken;
  }
}

test("allows local demo uploads without a gateway token", async () => {
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "demo";
  try {
    assert.equal(await gatewayUnauthorizedResponse(new Request("http://localhost")), null);
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});

test("rejects an invalid production gateway token", async () => {
  const response = await withProductionToken(() => gatewayUnauthorizedResponse(new Request("https://example.test", {
    headers: { Authorization: "Bearer wrong-token" },
  })));

  assert.equal(response?.status, 401);
  assert.equal((await response?.json()).code, "GATEWAY_UNAUTHORIZED");
});

test("rejects the old shared production gateway token", async () => {
  const response = await withProductionToken(() => gatewayUnauthorizedResponse(new Request("https://example.test", {
    headers: { Authorization: "Bearer test-gateway-token-24-chars" },
  })));

  assert.equal(response?.status, 401);
});

test("grants isolate patient and physical serial and expire or revoke closed", () => {
  const now = new Date("2026-09-06T00:00:00Z");
  const grant = { patientId: "patient-a", deviceSerials: ["sensor-a", "sensor-b"], expiresAt: new Date(now.getTime() + 1000), revokedAt: null };
  assert.equal(grantAllows(grant, "patient-a", "sensor-a", now), true);
  assert.equal(grantAllows(grant, "patient-b", "sensor-a", now), false);
  assert.equal(grantAllows(grant, "patient-a", "sensor-c", now), false);
  assert.equal(grantAllows({ ...grant, revokedAt: now }, "patient-a", "sensor-a", now), false);
  assert.equal(grantAllows({ ...grant, expiresAt: now }, "patient-a", "sensor-a", now), false);
  assert.equal(grantAllows(null, "patient-a", undefined, now), false);
});

test("credentials contain 256 bits of randomness and only a digest is stored", () => {
  const token = newGatewayToken();
  assert.match(token, /^tka_gw_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, newGatewayToken());
  assert.match(hashGatewayToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashGatewayToken(token), token);
});
