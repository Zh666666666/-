import { isUserRole, type UserRole } from "@/lib/auth";

export const localSessionCookie = "tka-local-session";
export const localSessionMaxAgeSeconds = 60 * 60 * 12;

type LocalSession = {
  role: UserRole;
  expiresAt: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createLocalSession(
  role: UserRole,
  secret: string,
  nowMs = Date.now(),
) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    role,
    expiresAt: nowMs + localSessionMaxAgeSeconds * 1000,
  } satisfies LocalSession)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyLocalSession(
  token: string | null | undefined,
  secret: string | null | undefined,
  nowMs = Date.now(),
): Promise<LocalSession | null> {
  if (!token || !secret || secret.length < 32) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<LocalSession>;
    if (!isUserRole(decoded.role) || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= nowMs) return null;
    return { role: decoded.role, expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

export async function secretsEqual(actual: string, expected: string) {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function localCredentials(role: UserRole) {
  return role === "family"
    ? { email: process.env["LOCAL_FAMILY_EMAIL"] ?? "", password: process.env["LOCAL_FAMILY_PASSWORD"] ?? "" }
    : { email: process.env["LOCAL_NURSE_EMAIL"] ?? "", password: process.env["LOCAL_NURSE_PASSWORD"] ?? "" };
}
