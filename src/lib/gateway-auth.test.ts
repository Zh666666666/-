import assert from "node:assert/strict";
import test from "node:test";

import { gatewayUnauthorizedResponse } from "./gateway-auth";

function withProductionToken<T>(callback: () => T) {
  const previousMode = process.env.APP_MODE;
  const previousToken = process.env.GATEWAY_API_TOKEN;
  process.env.APP_MODE = "production";
  process.env.GATEWAY_API_TOKEN = "test-gateway-token-24-chars";

  try {
    return callback();
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
    if (previousToken === undefined) delete process.env.GATEWAY_API_TOKEN;
    else process.env.GATEWAY_API_TOKEN = previousToken;
  }
}

test("allows local demo uploads without a gateway token", () => {
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = "demo";
  try {
    assert.equal(gatewayUnauthorizedResponse(new Request("http://localhost")), null);
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});

test("rejects an invalid production gateway token", async () => {
  const response = withProductionToken(() => gatewayUnauthorizedResponse(new Request("https://example.test", {
    headers: { Authorization: "Bearer wrong-token" },
  })));

  assert.equal(response?.status, 401);
  assert.equal((await response?.json()).code, "GATEWAY_UNAUTHORIZED");
});

test("accepts the configured production gateway token", () => {
  const response = withProductionToken(() => gatewayUnauthorizedResponse(new Request("https://example.test", {
    headers: { Authorization: "Bearer test-gateway-token-24-chars" },
  })));

  assert.equal(response, null);
});
