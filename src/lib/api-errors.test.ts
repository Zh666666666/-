import assert from "node:assert/strict";
import { test } from "node:test";

import { isRecordNotFound, updateOrNull } from "./api-errors";

test("detects the Prisma record-not-found code", () => {
  assert.equal(isRecordNotFound({ code: "P2025" }), true);
});

test("ignores other Prisma error codes", () => {
  assert.equal(isRecordNotFound({ code: "P2002" }), false);
  assert.equal(isRecordNotFound(new Error("connection refused")), false);
  assert.equal(isRecordNotFound(null), false);
  assert.equal(isRecordNotFound(undefined), false);
  assert.equal(isRecordNotFound("P2025"), false);
});

test("updateOrNull passes through a successful result", async () => {
  assert.deepEqual(await updateOrNull(Promise.resolve({ id: "a" })), { id: "a" });
});

test("updateOrNull converts a missing record into null", async () => {
  assert.equal(await updateOrNull(Promise.reject({ code: "P2025" })), null);
});

test("updateOrNull rethrows unrelated failures", async () => {
  await assert.rejects(
    () => updateOrNull(Promise.reject(new Error("database is down"))),
    /database is down/,
  );
  await assert.rejects(
    () => updateOrNull(Promise.reject({ code: "P2002" })),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
});
