import { z } from "zod";

const encoder = new TextEncoder();
const passwordIterations = 210_000;

export const registrationEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const registrationCompletionSchema = registrationEmailSchema.extend({
  name: z.string().trim().min(2).max(40),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(72)
    .regex(/[A-Za-z]/, "password must contain a letter")
    .regex(/\d/, "password must contain a number"),
});

function encode(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) throw new Error("Invalid encoded value");
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  ));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, passwordIterations);
  return `pbkdf2_sha256$${passwordIterations}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationsValue, saltValue, expectedValue, extra] = encoded.split("$");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2_sha256" || extra || !Number.isInteger(iterations) || iterations < 100_000) return false;
  try {
    const actual = await derivePassword(password, decode(saltValue), iterations);
    const expected = decode(expectedValue);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function generateVerificationCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

export function canResetAccount(status: string | null | undefined) {
  return status === undefined || status === null || status === "ACTIVE";
}

export async function hashVerificationCode(email: string, code: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${email.trim().toLowerCase()}:${code}`));
  return encode(new Uint8Array(signature));
}

export function registrationConfiguration() {
  const apiKey = process.env["RESEND_API_KEY"] ?? "";
  const from = process.env["EMAIL_FROM"] ?? "";
  return {
    apiKey,
    from,
    ready: apiKey.startsWith("re_") && from.includes("@"),
  };
}
