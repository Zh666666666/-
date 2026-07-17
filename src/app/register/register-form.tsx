"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState<"code" | "register" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function sendCode() {
    setError(null);
    setMessage(null);
    setLoading("code");
    try {
      const response = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, inviteCode }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "验证码发送失败");
      setCodeSent(true);
      setCountdown(60);
      setMessage("验证码已发送，请检查邮箱。");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "验证码发送失败");
    } finally {
      setLoading(null);
    }
  }

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading("register");
    try {
      const response = await fetch("/api/auth/register/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, code, inviteCode, password }),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(data.error ?? "注册失败");
      setMessage("注册成功，正在进入家属端。");
      router.replace(data.redirectTo ?? "/family");
      router.refresh();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "注册失败");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4efe5] px-4 py-6 text-[#17251f] md:px-8 md:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl overflow-hidden rounded-lg border border-[#d8c8ad] bg-white shadow-[0_28px_80px_rgba(46,61,50,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-[#17362d] p-6 text-white md:p-10">
          <Button asChild variant="outline" size="sm" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link href="/login"><ArrowLeft className="size-4" />返回登录</Link>
          </Button>
          <div className="mt-10 max-w-sm md:mt-16">
            <div className="flex size-12 items-center justify-center rounded-lg bg-[#f2c36b] text-[#17362d]">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="mt-6 text-2xl font-black md:text-4xl">创建家属账号</h1>
            <p className="mt-4 text-sm leading-7 text-[#d6e4da]">完成邮箱验证后进入家庭照护工作台。护士账号由平台管理员单独开通。</p>
          </div>
        </section>

        <section className="p-5 md:p-10">
          <div className="mb-7">
            <p className="text-xs font-black uppercase text-[#5b876f]">Verified registration</p>
            <h2 className="mt-2 text-2xl font-black">邮箱验证码注册</h2>
          </div>

          <form className="space-y-4" onSubmit={register}>
            <Field label="邮箱">
              <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="照护邀请码">
              <Input type="password" autoComplete="off" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
            </Field>
            <Button type="button" variant="outline" className="w-full" onClick={sendCode} disabled={loading !== null || countdown > 0 || !email || !inviteCode}>
              <Mail className="size-4" />
              {loading === "code" ? "正在发送" : countdown > 0 ? `${countdown} 秒后可重发` : codeSent ? "重新发送验证码" : "发送邮箱验证码"}
            </Button>

            {codeSent ? (
              <div className="grid gap-4 border-t border-[#eadfce] pt-5">
                <Field label="验证码">
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
                </Field>
                <Field label="姓名">
                  <Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </Field>
                <Field label="设置密码">
                  <Input type="password" autoComplete="new-password" minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <p className="mt-1 text-xs text-[#718174]">至少 12 位，包含字母和数字。</p>
                </Field>
              </div>
            ) : null}

            {message ? <p className="flex items-center gap-2 rounded-md bg-[#edf7f1] px-3 py-2 text-sm font-semibold text-[#285c43]"><CheckCircle2 className="size-4" />{message}</p> : null}
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

            <Button type="submit" className="h-12 w-full bg-[#17362d] text-white hover:bg-[#244b40]" disabled={!codeSent || loading !== null}>
              {loading === "register" ? <KeyRound className="size-5" /> : <UserPlus className="size-5" />}
              {loading === "register" ? "正在创建账号" : "验证并注册"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold text-[#4c5b50]">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
