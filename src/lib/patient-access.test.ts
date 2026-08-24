import assert from "node:assert/strict";
import test from "node:test";

import {
  createMedicalRecordNo,
  formatInviteCode,
  hashPatientInviteCode,
  inviteIsExpired,
  normalizeInviteCode,
  patientAccessActionSchema,
} from "./patient-access";

test("requires explicit confirmation before creating or linking a patient", () => {
  assert.equal(patientAccessActionSchema.safeParse({
    action: "SELF_CREATE",
    confirmed: false,
    patientName: "测试患者",
    age: 65,
    surgeryDate: "2026-08-01",
    surgicalSide: "RIGHT",
    relationToPatient: "本人",
  }).success, false);
});

test("allows a nurse to create a patient ownership code before seeing the patient", () => {
  assert.equal(patientAccessActionSchema.safeParse({ action: "CREATE_INVITE", confirmed: true }).success, true);
});

test("requires explicit confirmation for nurse handoff", () => {
  assert.equal(patientAccessActionSchema.safeParse({ action: "NURSE_RELEASE", confirmed: false, patientId: "patient-a" }).success, false);
});

test("normalizes human-friendly one-time invitation codes", () => {
  assert.equal(normalizeInviteCode("abcd-23ef"), "ABCD23EF");
  assert.equal(formatInviteCode("abcd23ef"), "ABCD-23EF");
});

test("hashes equivalent invitation code spellings identically", async () => {
  const secret = "patient-access-test-secret-value";
  assert.equal(
    await hashPatientInviteCode("ABCD-23EF", secret),
    await hashPatientInviteCode("abcd23ef", secret),
  );
});

test("creates non-identifying medical record numbers", () => {
  assert.equal(
    createMedicalRecordNo(new Date("2026-08-24T00:00:00.000Z"), "12345678-abcd-0000-0000-000000000000"),
    "WEB-20260824-12345678",
  );
});

test("treats an invitation as expired at its deadline", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(inviteIsExpired(new Date("2026-08-24T11:59:59.000Z"), now), true);
  assert.equal(inviteIsExpired(new Date("2026-08-24T12:01:00.000Z"), now), false);
});
