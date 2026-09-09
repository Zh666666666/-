import assert from "node:assert/strict";
import test from "node:test";

import { ageFromDateOfBirth, patientRecordSchema, recordCompleteness } from "./patient-record";

const valid = {
  name: "测试患者", gender: "FEMALE" as const, dateOfBirth: "1960-08-24", ethnicity: "汉族",
  nativePlace: "江苏南京", nationality: "中国", maritalStatus: "已婚", occupation: "退休", bloodType: "A",
  phone: "13800000000", homeAddress: "测试地址", emergencyContactName: "测试家属",
  emergencyContactRelation: "女儿", emergencyContactPhone: "13900000000", allergyStatus: "NONE" as const,
  allergyHistory: null, pastMedicalHistory: "高血压", surgicalHistory: "全膝关节置换术",
  familyMedicalHistory: "无特殊", medicationHistory: "按医嘱服药", diagnosis: "TKA 术后康复",
  surgeryDate: "2026-04-01", surgicalSide: "RIGHT" as const,
};

test("validates a complete hospital-style patient record", () => {
  assert.equal(patientRecordSchema.safeParse(valid).success, true);
  assert.equal(recordCompleteness(valid), 100);
});

test("requires allergy details when allergy is present", () => {
  assert.equal(patientRecordSchema.safeParse({ ...valid, allergyStatus: "PRESENT", allergyHistory: "" }).success, false);
});

test("derives age from date of birth", () => {
  assert.equal(ageFromDateOfBirth("1960-08-25", new Date("2026-08-24T00:00:00.000Z")), 65);
});

test("rejects surgery before birth", () => {
  assert.equal(patientRecordSchema.safeParse({ ...valid, surgeryDate: "1959-01-01" }).success, false);
});
