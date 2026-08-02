import assert from "node:assert/strict";
import test from "node:test";

import {
  gatewayCanAccess,
  hasSameOrigin,
  isPublicApi,
  requiresSameOrigin,
  roleCanAccessApi,
} from "./request-security";

test("keeps only authentication and health APIs public", () => {
  assert.equal(isPublicApi("/api/auth/login"), true);
  assert.equal(isPublicApi("/api/auth/logout"), false);
  assert.equal(isPublicApi("/api/auth/password/change"), false);
  assert.equal(isPublicApi("/api/health"), true);
  assert.equal(isPublicApi("/api/patients"), false);
});

test("limits gateway tokens to the hardware ingestion workflow", () => {
  assert.equal(gatewayCanAccess("/api/gateway/ready", "GET"), true);
  assert.equal(gatewayCanAccess("/api/sensor-samples/batch", "POST"), true);
  assert.equal(gatewayCanAccess("/api/device-calibrations", "POST"), true);
  assert.equal(gatewayCanAccess("/api/devices/heartbeat", "POST"), true);
  assert.equal(gatewayCanAccess("/api/sensor-samples", "GET"), false);
  assert.equal(gatewayCanAccess("/api/alerts/alert-1", "PATCH"), false);
});

test("enforces nurse-only clinical mutations", () => {
  assert.equal(roleCanAccessApi("family", "/api/alerts/alert-1", "PATCH"), false);
  assert.equal(roleCanAccessApi("family", "/api/appointments/appointment-1", "PATCH"), false);
  assert.equal(roleCanAccessApi("family", "/api/nursing-records", "POST"), false);
  assert.equal(roleCanAccessApi("nurse", "/api/nursing-records", "POST"), true);
  assert.equal(roleCanAccessApi("family", "/api/nursing-records/record-1", "PATCH"), true);
});

test("requires exact same-origin requests for cookie-authenticated mutations", () => {
  assert.equal(requiresSameOrigin("PATCH"), true);
  assert.equal(requiresSameOrigin("GET"), false);
  assert.equal(hasSameOrigin("https://care.example/api/profile", "https://care.example"), true);
  assert.equal(hasSameOrigin("http://app:3000/api/profile", "https://care.example", "https://care.example"), true);
  assert.equal(hasSameOrigin("https://care.example/api/profile", "https://attacker.example"), false);
  assert.equal(hasSameOrigin("https://care.example/api/profile", null), false);
});
