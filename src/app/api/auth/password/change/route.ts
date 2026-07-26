import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { localCredentials, localSessionCookie, secretsEqual, verifyLocalSession } from "@/lib/local-auth";
import { hashPassword, verifyPassword } from "@/lib/registration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(12).max(72).regex(/[A-Za-z]/).regex(/\d/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "新密码至少 12 位，并包含字母和数字。" }, { status: 400 });
  const cookieStore = await cookies();
  const session = await verifyLocalSession(
    cookieStore.get(localSessionCookie)?.value,
    process.env["LOCAL_AUTH_SESSION_SECRET"],
  );
  if (!session) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });

  const expectedRole = session.role === "family" ? "patient" : "nurse";
  let account = session.accountId
    ? await prisma.authAccount.findUnique({ where: { id: session.accountId } })
    : null;
  if (account) {
    if (!await verifyPassword(parsed.data.currentPassword, account.passwordHash)) {
      return NextResponse.json({ error: "当前密码不正确。" }, { status: 403 });
    }
  } else {
    const defaults = localCredentials(session.role);
    if (!await secretsEqual(parsed.data.currentPassword, defaults.password)) {
      return NextResponse.json({ error: "当前密码不正确。" }, { status: 403 });
    }
    account = await prisma.authAccount.upsert({
      where: { email: defaults.email.trim().toLowerCase() },
      update: {},
      create: {
        email: defaults.email.trim().toLowerCase(),
        passwordHash: await hashPassword(parsed.data.newPassword),
        role: expectedRole,
        verifiedAt: new Date(),
      },
    });
  }
  await prisma.authAccount.update({
    where: { id: account.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  return NextResponse.json({ ok: true });
}
