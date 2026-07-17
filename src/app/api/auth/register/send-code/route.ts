import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthMode } from "@/lib/env";
import { secretsEqual } from "@/lib/local-auth";
import { generateVerificationCode, hashVerificationCode, registrationConfiguration } from "@/lib/registration-auth";
import { sendRegistrationCode } from "@/lib/registration-email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  inviteCode: z.string().min(1).max(128),
});

const requests = new Map<string, { count: number; resetAt: number }>();
const windowMs = 15 * 60 * 1000;

function acceptRequest(key: string, now = Date.now()) {
  const current = requests.get(key);
  if (!current || current.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (resolveAuthMode() !== "local") {
    return NextResponse.json({ error: "当前认证模式不支持邮箱注册。" }, { status: 404 });
  }

  const config = registrationConfiguration();
  if (!config.ready) {
    return NextResponse.json({ error: "邮箱注册服务尚未配置完成。" }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请填写有效邮箱和照护邀请码。" }, { status: 400 });

  if (!await secretsEqual(parsed.data.inviteCode, config.inviteCode)) {
    return NextResponse.json({ error: "照护邀请码不正确。" }, { status: 403 });
  }

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
  if (!acceptRequest(`${client}:${parsed.data.email}`)) {
    return NextResponse.json({ error: "发送过于频繁，请稍后再试。" }, { status: 429 });
  }

  const existing = await prisma.authAccount.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ ok: true, message: "若该邮箱可以注册，验证码将很快送达。" });
  }

  const recent = await prisma.emailVerification.findFirst({
    where: { email: parsed.data.email, purpose: "REGISTRATION" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
    return NextResponse.json({ error: "验证码已发送，请 60 秒后再试。" }, { status: 429 });
  }

  const code = generateVerificationCode();
  const secret = process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
  const verification = await prisma.emailVerification.create({
    data: {
      email: parsed.data.email,
      codeHash: await hashVerificationCode(parsed.data.email, code, secret),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    select: { id: true },
  });

  try {
    await sendRegistrationCode({ apiKey: config.apiKey, from: config.from, to: parsed.data.email, code });
  } catch (error) {
    await prisma.emailVerification.delete({ where: { id: verification.id } }).catch(() => undefined);
    console.error("Registration email delivery failed", error);
    return NextResponse.json({ error: "验证码邮件暂时发送失败，请稍后重试。" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expiresInSeconds: 600 });
}
