"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, UserPlus } from "lucide-react";

import { BrandLockup, RangeOfMotionDial } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const assurances = [
  ["邮箱验证", "验证码确认账号归属，避免误绑。"],
  ["邀请制开通", "照护邀请码由责任护士发放。"],
  ["角色隔离", "家属仅能看到自己患者的数据。"],
] as const;

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
    <main className="min-h-[100dvh] bg-canvas text-ink-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(27rem,32rem)]">
      {/* ---------- 品牌面板 ---------- */}
      <aside className="panel-ink grain rim-light relative overflow-hidden rounded-b-3xl px-5 pb-8 pt-5 lg:flex lg:flex-col lg:justify-between lg:rounded-none lg:px-14 lg:py-12 xl:px-20">
        <div
          className="pointer-events-none absolute -right-32 top-1/2 hidden aspect-square w-[36rem] -translate-y-1/2 opacity-50 lg:block xl:w-[44rem]"
          aria-hidden="true"
        >
          <RangeOfMotionDial />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <BrandLockup tone="light" subtitle="术后康复监测平台" />
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[0.75rem] font-medium text-white/70 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            返回登录
          </Link>
        </div>

        <div className="relative z-10 mt-8 max-w-xl lg:mt-0">
          <p className="eyebrow rise text-brass-300" style={{ ["--i" as string]: 0 }}>
            Verified Registration
          </p>
          <h1
            className="display-xl rise mt-3.5 text-[1.9rem] text-[#f7f3ea] sm:text-[2.4rem] lg:mt-6 lg:text-[3.4rem] xl:text-[3.9rem]"
            style={{ ["--i" as string]: 1 }}
          >
            创建家属账号，
            <br className="hidden sm:block" />
            接手今日照护。
          </h1>
          <p
            className="rise mt-4 max-w-lg text-[0.875rem] leading-6 text-white/55 lg:mt-7 lg:text-[1.0625rem] lg:leading-8"
            style={{ ["--i" as string]: 2 }}
          >
            完成邮箱验证后进入家庭照护工作台。护士账号由平台管理员单独开通。
          </p>
        </div>

        <div
          className="rise relative z-10 mt-8 hidden border-t border-white/10 pt-7 lg:grid lg:grid-cols-3"
          style={{ ["--i" as string]: 3 }}
        >
          {assurances.map(([title, description], index) => (
            <div key={title} className={index > 0 ? "border-l border-white/10 pl-6 pr-6" : "pr-6"}>
              <p className="serif-accent text-xl leading-none text-brass-400/90">0{index + 1}</p>
              <p className="mt-3 text-[0.9375rem] font-medium text-[#f7f3ea]">{title}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-5 text-white/45">{description}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------- 注册面板 ---------- */}
      <section className="ambient relative flex items-center justify-center px-4 py-4 sm:px-6 lg:px-10 lg:py-12">
        <div className="veil relative z-10 w-full max-w-[26.5rem] rounded-2xl border border-[var(--hairline)] bg-white/80 p-5 shadow-e4 backdrop-blur-md sm:p-8">
          <header>
            <p className="eyebrow text-brass-700">Step 1 — 验证邮箱</p>
            <h2 className="display-md mt-3 text-[1.625rem] lg:text-[1.875rem]">邮箱验证码注册</h2>
            <p className="mt-2.5 text-[0.875rem] leading-6 text-[var(--muted-foreground)]">
              请使用与护士登记一致的邮箱，并填写收到的照护邀请码。
            </p>
          </header>

          <form className="mt-7 space-y-4" onSubmit={register}>
            <Field label="邮箱">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="照护邀请码">
              <Input
                type="password"
                autoComplete="off"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={sendCode}
              disabled={loading !== null || countdown > 0 || !email || !inviteCode}
            >
              {loading === "code" ? (
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-ink-900/20 border-t-ink-900"
                />
              ) : (
                <Mail className="size-4" />
              )}
              {loading === "code"
                ? "正在发送"
                : countdown > 0
                  ? `${countdown} 秒后可重发`
                  : codeSent
                    ? "重新发送验证码"
                    : "发送邮箱验证码"}
            </Button>

            {codeSent ? (
              <div className="veil grid gap-4 border-t border-[var(--hairline)] pt-5">
                <p className="eyebrow text-brass-700">Step 2 — 完善资料</p>
                <Field label="验证码">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    required
                    className="tabular tracking-[0.4em]"
                  />
                </Field>
                <Field label="姓名">
                  <Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </Field>
                <Field label="设置密码" hint="至少 12 位，包含字母和数字。">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
              </div>
            ) : null}

            {message ? (
              <p className="flex items-center gap-2 rounded-lg border border-[rgba(47,125,92,0.18)] bg-[var(--success-soft)] px-3.5 py-2.5 text-[0.8125rem] font-medium leading-5 text-[var(--success)]">
                <CheckCircle2 className="size-4 shrink-0" />
                {message}
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-[rgba(176,67,56,0.20)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[0.8125rem] font-medium leading-5 text-[var(--destructive)]"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="h-12 w-full" disabled={!codeSent || loading !== null}>
              {loading === "register" ? (
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white"
                />
              ) : (
                <UserPlus className="size-4" />
              )}
              {loading === "register" ? "正在创建账号" : "验证并注册"}
            </Button>
          </form>

          <p className="mt-7 flex items-center justify-center gap-2 border-t border-[var(--hairline)] pt-5 text-[0.75rem] text-[var(--subtle-foreground)]">
            <ShieldCheck className="size-3.5" />
            注册即代表同意按医嘱使用平台记录的康复数据
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-[#4d5c53]">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[0.75rem] text-[var(--subtle-foreground)]">{hint}</span> : null}
    </label>
  );
}
