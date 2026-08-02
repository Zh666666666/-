import assert from "node:assert/strict";
import test from "node:test";

import { canAccessPatient, type DataAccessContext } from "./access-control";

const family: DataAccessContext = {
  role: "family",
  userId: "family-a",
  patientId: "patient-a",
  unrestricted: false,
};

test("limits a family account to its explicitly linked patient", () => {
  assert.equal(canAccessPatient(family, "patient-a"), true);
  assert.equal(canAccessPatient(family, "patient-b"), false);
});

test("keeps an unlinked family account fail-closed", () => {
  assert.equal(canAccessPatient({ ...family, patientId: null }, "patient-a"), false);
});

test("keeps nurse access across assigned patients", () => {
  assert.equal(canAccessPatient({ ...family, role: "nurse", unrestricted: true }, "patient-b"), true);
});
