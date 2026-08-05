import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthRole, roleFromAuthUser } from "./auth";

test("uses only administrator-controlled Supabase app metadata for roles", () => {
  assert.equal(roleFromAuthUser({ app_metadata: { role: "nurse" } }), "nurse");
  assert.equal(roleFromAuthUser({ user_metadata: { role: "nurse" } }), null);
});

test("does not let an authenticated Supabase user fall back to a role cookie", () => {
  assert.equal(resolveAuthRole({ app_metadata: {} }, "nurse"), null);
  assert.equal(resolveAuthRole(null, "family"), "family");
});
