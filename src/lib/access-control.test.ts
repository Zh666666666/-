import assert from "node:assert/strict";
import test from "node:test";

import { accessiblePatientIds, canAccessPatient, type DataAccessContext } from "./access-control";

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

test("two nurses and two families have disjoint scopes before and after handoff", () => {
  const contexts: DataAccessContext[] = [
    family,
    { ...family, userId: "family-b", patientId: "patient-b" },
    { ...family, role: "nurse", userId: "nurse-a", patientId: null, managedPatientIds: ["patient-a", "patient-c"] },
    { ...family, role: "nurse", userId: "nurse-b", patientId: null, managedPatientIds: ["patient-b"] },
  ];
  for (const context of contexts) {
    const ids = accessiblePatientIds(context)!;
    for (const id of ["patient-a", "patient-b", "patient-c", "unknown", ""]) {
      assert.equal(canAccessPatient(context, id), ids.includes(id), `${context.userId}: ${id}`);
    }
  }
  const oldNurse = { ...contexts[2], managedPatientIds: ["patient-c"] };
  const newNurse = { ...contexts[3], managedPatientIds: ["patient-a", "patient-b"] };
  assert.equal(canAccessPatient(oldNurse, "patient-a"), false);
  assert.equal(canAccessPatient(newNurse, "patient-a"), true);
  assert.deepEqual(accessiblePatientIds(family), ["patient-a"]);
});

test("empty production scopes remain empty, while explicit demo scope is unrestricted", () => {
  assert.deepEqual(accessiblePatientIds({ ...family, patientId: null }), []);
  assert.deepEqual(accessiblePatientIds({ ...family, role: "nurse", patientId: null }), []);
  const demo = { ...family, unrestricted: true };
  assert.equal(accessiblePatientIds(demo), undefined);
  assert.equal(canAccessPatient(demo, "patient-b"), true);
});
