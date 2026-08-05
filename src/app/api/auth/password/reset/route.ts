import { NextResponse } from "next/server";
import { z } from "zod";

import { localCredentials, secretsEqual } from "@/lib/local-auth";
import { canResetAccount, hashPassword, hashVerificationCode } from "@/lib/registration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(72).regex(/[A-Za-z]/).regex(/\d/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请填写有效验证码和至少 12 位的新密码。" }, { status: 400 });

  const verification = await prisma.emailVerification.findFirst({
    where: {
      email: parsed.data.email,
      purpose: "RESET_PASSWORD",
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
    await prisma.emailVerification.update({ where: { id: verification.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "验证码不正确。" }, { status: 400 });
  }

  let account = await prisma.authAccount.findUnique({ where: { email: parsed.data.email } });
  if (account && !canResetAccount(account.status)) {
    return NextResponse.json({ error: "Verification code is invalid or expired" }, { status: 400 });
  }
  if (!account) {
    const family = localCredentials("family");
    const nurse = localCredentials("nurse");
    const role = await secretsEqual(parsed.data.email, family.email.trim().toLowerCase())
      ? "patient"
      : await secretsEqual(parsed.data.email, nurse.email.trim().toLowerCase())
        ? "nurse"
        : null;
    if (!role) return NextResponse.json({ error: "验证码无效或已过期。" }, { status: 400 });
    account = await prisma.authAccount.create({
      data: {
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role,
        verifiedAt: new Date(),
      },
    });
  }

  await prisma.$transaction([
    prisma.authAccount.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.emailVerification.update({ where: { id: verification.id }, data: { consumedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
