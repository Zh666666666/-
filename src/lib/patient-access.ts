import { z } from "zod";

const encoder = new TextEncoder();
const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const confirmed = z.literal(true, { error: "请先确认授权范围。" });

export const patientAccessActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SELF_CREATE"),
    confirmed,
    patientName: z.string().trim().min(2).max(40),
    age: z.coerce.number().int().min(1).max(120),
    surgeryDate: z.string().date(),
    surgicalSide: z.enum(["LEFT", "RIGHT", "BILATERAL"]),
    relationToPatient: z.string().trim().min(1).max(40),
  }),
  z.object({
    action: z.literal("CREATE_INVITE"),
    confirmed,
    patientId: z.string().trim().min(1).max(100).optional(),
  }),
  z.object({
    action: z.literal("ACCEPT_INVITE"),
    confirmed,
    code: z.string().trim().min(8).max(12),
  }),
  z.object({
    action: z.literal("REVOKE_INVITE"),
    confirmed,
    patientId: z.string().trim().min(1).max(100).optional(),
    invitationId: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("FAMILY_UNLINK"),
    confirmed,
  }),
  z.object({
    action: z.literal("NURSE_REVOKE"),
    confirmed,
    patientId: z.string().trim().min(1).max(100),
    profileId: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("NURSE_RELEASE"),
    confirmed,
    patientId: z.string().trim().min(1).max(100),
  }),
]);

export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatInviteCode(value: string) {
  const normalized = normalizeInviteCode(value);
  return normalized.length <= 4 ? normalized : `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

export function generatePatientInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(bytes, (byte) => inviteAlphabet[byte % inviteAlphabet.length]).join("");
  return formatInviteCode(code);
}

export async function hashPatientInviteCode(code: string, secret: string) {
  if (secret.length < 16) throw new Error("Patient invitation secret is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`patient-link:${normalizeInviteCode(code)}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createMedicalRecordNo(now = new Date(), id = crypto.randomUUID()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `WEB-${date}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function inviteIsExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}
