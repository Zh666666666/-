import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie, defaultPathForRole } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/registration-auth";
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

const attempts = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

export async function POST(request: Request) {
  if (resolveAuthMode() !== "local") {
    return NextResponse.json({ error: "Local authentication is not enabled." }, { status: 404 });
  }

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
  if (!attempts.check(client).allowed) {
    return NextResponse.json({ error: "登录尝试过多，请 15 分钟后重试。" }, { status: 429 });
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "账号或密码不正确。" }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const expected = localCredentials(parsed.data.role);
  let accountId: string | undefined;
  const expectedRole = parsed.data.role === "family" ? "patient" : "nurse";
  const account = await prisma.authAccount.findUnique({ where: { email: normalizedEmail } });
  if (account) {
    const registeredPasswordMatches = account ? await verifyPassword(parsed.data.password, account.passwordHash) : false;
    if (!account || account.status !== "ACTIVE" || account.role !== expectedRole || !registeredPasswordMatches) {
      return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
    }
    accountId = account.id;
  } else {
    const emailMatches = await secretsEqual(normalizedEmail, expected.email.trim().toLowerCase());
    const passwordMatches = await secretsEqual(parsed.data.password, expected.password);
    if (!emailMatches || !passwordMatches) {
      return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
    }
  }

  const secret = process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
  const token = await createLocalSession(parsed.data.role, secret, Date.now(), accountId);
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
  attempts.reset(client);

  return NextResponse.json({
    role: parsed.data.role,
    redirectTo: defaultPathForRole(parsed.data.role),
  });
}
