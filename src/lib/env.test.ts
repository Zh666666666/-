import assert from "node:assert/strict";
import test from "node:test";

import { getRuntimeReadiness, resolveAppMode, resolveAuthMode } from "./env";

test("defaults local development to demo mode", () => {
  assert.equal(resolveAppMode({ NODE_ENV: "development" }), "demo");
  assert.equal(getRuntimeReadiness({ NODE_ENV: "development" }).ready, true);
});

test("fails closed when a production build omits APP_MODE", () => {
  const readiness = getRuntimeReadiness({ NODE_ENV: "production" });

  assert.equal(readiness.mode, "invalid");
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues[0], /APP_MODE/);
});

test("requires durable storage, Supabase auth, and gateway auth in production mode", () => {
  const missing = getRuntimeReadiness({ APP_MODE: "production", NODE_ENV: "production" });
  assert.equal(missing.ready, false);
  assert.equal(missing.issues.length, 3);

  const ready = getRuntimeReadiness({
    APP_MODE: "production",
    AUTH_MODE: "supabase",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:secret@example.test:5432/tka",
    GATEWAY_API_TOKEN: "test-gateway-token-24-chars",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.durableStorage, true);
  assert.equal(ready.authentication, true);
  assert.equal(ready.gatewayAuthentication, true);
});

test("accepts complete self-hosted authentication and rejects incomplete credentials", () => {
  const base = {
    APP_MODE: "production",
    AUTH_MODE: "local",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:secret@example.test:5432/tka",
    GATEWAY_API_TOKEN: "test-gateway-token-24-chars",
  };
  assert.equal(resolveAuthMode(base), "local");
  assert.equal(getRuntimeReadiness(base).ready, false);

  const ready = getRuntimeReadiness({
    ...base,
    LOCAL_AUTH_SESSION_SECRET: "session-secret-that-is-at-least-32-characters",
    LOCAL_FAMILY_EMAIL: "family@example.test",
    LOCAL_FAMILY_PASSWORD: "family-password-123",
    LOCAL_NURSE_EMAIL: "nurse@example.test",
    LOCAL_NURSE_PASSWORD: "nurse-password-123",
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.authMode, "local");
  assert.equal(ready.authentication, true);
});
