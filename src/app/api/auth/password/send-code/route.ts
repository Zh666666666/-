import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { localCredentials, secretsEqual } from "@/lib/local-auth";
import { generateVerificationCode, hashVerificationCode, registrationConfiguration } from "@/lib/registration-auth";
import { sendVerificationCode } from "@/lib/registration-email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const requests = new Map<string, number>();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请填写有效邮箱。" }, { status: 400 });

  const config = registrationConfiguration();
  if (!config.ready) return NextResponse.json({ error: "邮箱服务尚未配置完成。" }, { status: 503 });

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${client}:${parsed.data.email}`;
  const last = requests.get(key) ?? 0;
  if (Date.now() - last < 60_000) {
    return NextResponse.json({ error: "验证码已发送，请 60 秒后再试。" }, { status: 429 });
  }
  requests.set(key, Date.now());

  const account = await prisma.authAccount.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  const matchesDefault = await Promise.all(["family", "nurse"].map(async (role) => (
    secretsEqual(parsed.data.email, localCredentials(role as "family" | "nurse").email.trim().toLowerCase())
  )));
  if (!account && !matchesDefault.some(Boolean)) {
    return NextResponse.json({ ok: true, message: "若该邮箱已注册，验证码将很快送达。" });
  }

  const code = generateVerificationCode();
  const secret = process.env["LOCAL_AUTH_SESSION_SECRET"] ?? "";
  const verification = await prisma.emailVerification.create({
    data: {
      email: parsed.data.email,
      purpose: "RESET_PASSWORD",
      codeHash: await hashVerificationCode(parsed.data.email, code, secret),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    select: { id: true },
  });
  try {
    await sendVerificationCode({ apiKey: config.apiKey, from: config.from, to: parsed.data.email, code, purpose: "reset" });
  } catch (error) {
    await prisma.emailVerification.delete({ where: { id: verification.id } }).catch(() => undefined);
    console.error("Password reset email delivery failed", error);
    return NextResponse.json({ error: "验证码邮件暂时发送失败，请稍后重试。" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, expiresInSeconds: 600 });
}
