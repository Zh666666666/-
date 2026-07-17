import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, defaultPathForRole } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import {
  createLocalSession,
  localCredentials,
  localSessionCookie,
  localSessionMaxAgeSeconds,
  secretsEqual,
} from "@/lib/local-auth";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  role: z.enum(["family", "nurse"]),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const attemptWindowMs = 15 * 60 * 1000;
const maximumAttempts = 8;

function consumeAttempt(client: string, now = Date.now()) {
  const existing = attempts.get(client);
  if (!existing || existing.resetAt <= now) {
    attempts.set(client, { count: 1, resetAt: now + attemptWindowMs });
    return true;
  }
  if (existing.count >= maximumAttempts) return false;
  existing.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (resolveAuthMode() !== "local") {
    return NextResponse.json({ error: "Local authentication is not enabled." }, { status: 404 });
  }

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
  if (!consumeAttempt(client)) {
    return NextResponse.json({ error: "登录尝试过多，请 15 分钟后重试。" }, { status: 429 });
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "账号或密码不正确。" }, { status: 400 });
  }

  const expected = localCredentials(parsed.data.role);
  const emailMatches = await secretsEqual(parsed.data.email.trim().toLowerCase(), expected.email.trim().toLowerCase());
  const passwordMatches = await secretsEqual(parsed.data.password, expected.password);
  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
  }

  const secret = process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
  const token = await createLocalSession(parsed.data.role, secret);
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: localSessionMaxAgeSeconds,
  };
  cookieStore.set(localSessionCookie, token, options);
  cookieStore.set(authRoleCookie, parsed.data.role, options);
  attempts.delete(client);

  return NextResponse.json({
    role: parsed.data.role,
    redirectTo: defaultPathForRole(parsed.data.role),
  });
}
