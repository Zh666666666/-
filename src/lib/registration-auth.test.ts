import assert from "node:assert/strict";
import test from "node:test";

import { generateVerificationCode, hashPassword, hashVerificationCode, verifyPassword } from "./registration-auth";

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
