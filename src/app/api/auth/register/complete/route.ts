import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authRoleCookie } from "@/lib/auth";
import { resolveAuthMode } from "@/lib/env";
import { createLocalSession, localSessionCookie, localSessionMaxAgeSeconds, secretsEqual } from "@/lib/local-auth";
import { hashPassword, hashVerificationCode, registrationConfiguration } from "@/lib/registration-auth";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  inviteCode: z.string().min(1).max(128),
  password: z.string().min(12).max(72)
    .regex(/[A-Za-z]/, "password must contain a letter")
    .regex(/\d/, "password must contain a number"),
});

const completions = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

export async function POST(request: Request) {
  if (resolveAuthMode() !== "local") {
    return NextResponse.json({ error: "当前认证模式不支持邮箱注册。" }, { status: 404 });
  }
  const config = registrationConfiguration();
  if (!config.ready) return NextResponse.json({ error: "邮箱注册服务尚未配置完成。" }, { status: 503 });

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请完整填写资料，密码至少 12 位并包含字母和数字。" }, { status: 400 });
  }
  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
  const completionKey = `${client}:${parsed.data.email}`;
  if (!completions.check(completionKey).allowed) {
    return NextResponse.json({ error: "注册尝试过多，请稍后再试。" }, { status: 429 });
  }
  if (!await secretsEqual(parsed.data.inviteCode, config.inviteCode)) {
    return NextResponse.json({ error: "照护邀请码不正确。" }, { status: 403 });
  }

  const verification = await prisma.emailVerification.findFirst({
    where: {
      email: parsed.data.email,
      purpose: "REGISTRATION",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!verification || verification.attempts >= 5) {
    return NextResponse.json({ error: "验证码无效或已过期，请重新获取。" }, { status: 400 });
  }

  const secret = process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
  const suppliedHash = await hashVerificationCode(parsed.data.email, parsed.data.code, secret);
  if (!await secretsEqual(suppliedHash, verification.codeHash)) {
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "验证码不正确。" }, { status: 400 });
  }

  const duplicate = await prisma.authAccount.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (duplicate) return NextResponse.json({ error: "该邮箱已经注册，请直接登录。" }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);
  const account = await prisma.$transaction(async (transaction) => {
    const created = await transaction.authAccount.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        role: "patient",
        verifiedAt: new Date(),
      },
    });
    await transaction.profile.create({
      data: { userId: created.id, role: "patient", name: parsed.data.name },
    });
    await transaction.emailVerification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });
    return created;
  });

  const token = await createLocalSession("family", secret, Date.now(), account.id);
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: localSessionMaxAgeSeconds,
  };
  cookieStore.set(localSessionCookie, token, options);
  cookieStore.set(authRoleCookie, "family", options);
  completions.reset(completionKey);

  return NextResponse.json({ ok: true, role: "family", redirectTo: "/family" }, { status: 201 });
}
