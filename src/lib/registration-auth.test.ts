import assert from "node:assert/strict";
import test from "node:test";

import {
  canResetAccount,
  generateVerificationCode,
  hashPassword,
  hashVerificationCode,
  registrationCompletionSchema,
  registrationConfiguration,
  registrationEmailSchema,
  verifyPassword,
} from "./registration-auth";

test("hashes and verifies registration passwords", async () => {
  const encoded = await hashPassword("A-secure-password-2026");
  assert.equal(await verifyPassword("A-secure-password-2026", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(encoded.includes("A-secure-password-2026"), false);
});

test("creates six-digit codes and binds their hash to the email", async () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
  const secret = "registration-test-secret-that-is-long-enough";
  const first = await hashVerificationCode("family@example.com", code, secret);
  const same = await hashVerificationCode("FAMILY@example.com", code, secret);
  const other = await hashVerificationCode("other@example.com", code, secret);
  assert.equal(first, same);
  assert.notEqual(first, other);
});

test("does not allow password reset to reactivate a disabled account", () => {
  assert.equal(canResetAccount("ACTIVE"), true);
  assert.equal(canResetAccount("DISABLED"), false);
});

test("accepts public email registration without an invite code", () => {
  assert.equal(registrationEmailSchema.safeParse({ email: " Visitor@Example.com " }).success, true);
  assert.equal(registrationCompletionSchema.safeParse({
    name: "访客用户",
    email: "visitor@example.com",
    code: "123456",
    password: "Visitor-password-2026",
  }).success, true);
});

test("registration readiness depends only on the email provider", () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  const previousInvite = process.env.REGISTRATION_INVITE_CODE;
  try {
    process.env.RESEND_API_KEY = "re_test_public_registration";
    process.env.EMAIL_FROM = "TKA <verify@example.com>";
    delete process.env.REGISTRATION_INVITE_CODE;
    assert.equal(registrationConfiguration().ready, true);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
    if (previousInvite === undefined) delete process.env.REGISTRATION_INVITE_CODE;
    else process.env.REGISTRATION_INVITE_CODE = previousInvite;
  }
});
