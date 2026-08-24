import assert from "node:assert/strict";
import test from "node:test";

import { canAccessPatient, type DataAccessContext } from "./access-control";

const family: DataAccessContext = {
  role: "family",
  userId: "family-a",
  patientId: "patient-a",
  managedPatientIds: [],
  unrestricted: false,
};

test("limits a family account to its explicitly linked patient", () => {
  assert.equal(canAccessPatient(family, "patient-a"), true);
  assert.equal(canAccessPatient(family, "patient-b"), false);
});

test("keeps an unlinked family account fail-closed", () => {
  assert.equal(canAccessPatient({ ...family, patientId: null }, "patient-a"), false);
});

test("limits a nurse account to explicitly assigned patients", () => {
  const nurse = { ...family, role: "nurse" as const, patientId: null, managedPatientIds: ["patient-b"] };
  assert.equal(canAccessPatient(nurse, "patient-b"), true);
  assert.equal(canAccessPatient(nurse, "patient-c"), false);
});
