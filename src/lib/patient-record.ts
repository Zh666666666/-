import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const patientRecordSchema = z.object({
  name: z.string().trim().min(2, "请填写患者姓名。").max(60),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  ethnicity: optionalText(40),
  nativePlace: optionalText(100),
  nationality: optionalText(40),
  maritalStatus: optionalText(20),
  occupation: optionalText(80),
  bloodType: optionalText(20),
  phone: optionalText(30),
  homeAddress: optionalText(200),
  emergencyContactName: optionalText(60),
  emergencyContactRelation: optionalText(40),
  emergencyContactPhone: optionalText(30),
  allergyStatus: z.enum(["UNKNOWN", "NONE", "PRESENT"]),
  allergyHistory: optionalText(500),
  pastMedicalHistory: optionalText(1000),
  surgicalHistory: optionalText(1000),
  familyMedicalHistory: optionalText(1000),
  medicationHistory: optionalText(1000),
  diagnosis: z.string().trim().min(1).max(200),
  surgeryDate: z.string().date(),
  surgicalSide: z.enum(["LEFT", "RIGHT", "BILATERAL"]),
}).superRefine((record, context) => {
  if (record.dateOfBirth && new Date(`${record.dateOfBirth}T00:00:00.000Z`).getTime() > Date.now()) {
    context.addIssue({ code: "custom", path: ["dateOfBirth"], message: "出生日期不能晚于今天。" });
  }
  if (new Date(`${record.surgeryDate}T00:00:00.000Z`).getTime() > Date.now()) {
    context.addIssue({ code: "custom", path: ["surgeryDate"], message: "手术日期不能晚于今天。" });
  }
  if (record.dateOfBirth && record.surgeryDate < record.dateOfBirth) {
    context.addIssue({ code: "custom", path: ["surgeryDate"], message: "手术日期不能早于出生日期。" });
  }
  if (record.allergyStatus === "PRESENT" && !record.allergyHistory?.trim()) {
    context.addIssue({ code: "custom", path: ["allergyHistory"], message: "已选择有过敏史，请填写具体内容。" });
  }
});

export type PatientRecordInput = z.infer<typeof patientRecordSchema>;

export function ageFromDateOfBirth(dateOfBirth: string, now = new Date()) {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return Math.max(0, Math.min(120, age));
}

export function recordCompleteness(record: PatientRecordInput) {
  const values = [record.name, record.gender, record.dateOfBirth, record.ethnicity, record.nativePlace,
    record.nationality, record.maritalStatus, record.occupation, record.phone, record.homeAddress,
    record.emergencyContactName, record.emergencyContactRelation, record.emergencyContactPhone,
    record.allergyStatus !== "UNKNOWN" ? record.allergyStatus : null, record.pastMedicalHistory,
    record.surgicalHistory, record.familyMedicalHistory, record.medicationHistory, record.diagnosis,
    record.surgeryDate, record.surgicalSide];
  return Math.round(values.filter((value) => value !== null && value !== undefined && value !== "").length / values.length * 100);
}
