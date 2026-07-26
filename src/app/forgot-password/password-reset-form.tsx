"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordResetForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/auth/password/send-code", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "验证码发送失败");
      setSent(true);
      setMessage(data.message ?? "验证码已发送，请检查邮箱。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证码发送失败");
    } finally { setBusy(false); }
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "密码重置失败");
      setMessage("密码已重置，请返回登录。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码重置失败");
    } finally { setBusy(false); }
  }

  return (
    <main className="ambient relative flex min-h-[100dvh] items-center justify-center bg-canvas p-4 text-ink-900">
      <section className="veil relative z-10 w-full max-w-[26rem] rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-e3 sm:p-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/login">
            <ArrowLeft className="size-4" />
            返回登录
          </Link>
        </Button>

        <span className="mt-6 flex size-11 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="display-md mt-5 text-[1.625rem]">重置密码</h1>
        <p className="mt-2.5 text-[0.875rem] leading-6 text-[var(--muted-foreground)]">
          家属和护士账号均可通过已绑定邮箱重置。
        </p>

        <form className="mt-7 space-y-4" onSubmit={reset}>
          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-[#4d5c53]">邮箱</span>
            <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={send} disabled={busy || !email}>
            {busy && !sent ? (
              <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-ink-900/20 border-t-ink-900" />
            ) : (
              <Mail className="size-4" />
            )}
            发送验证码
          </Button>
          {sent ? (
            <div className="veil space-y-4 border-t border-[var(--hairline)] pt-5">
              <label className="block">
                <span className="mb-1.5 block text-[0.8125rem] font-medium text-[#4d5c53]">验证码</span>
                <Input
                  className="tabular tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.8125rem] font-medium text-[#4d5c53]">新密码</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <span className="mt-1.5 block text-[0.75rem] text-[var(--subtle-foreground)]">至少 12 位，包含字母和数字。</span>
              </label>
              <Button className="h-12 w-full" size="lg" type="submit" disabled={busy}>
                {busy ? (
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                ) : null}
                确认重置
              </Button>
            </div>
          ) : null}
          {message ? (
            <p className="rounded-lg border border-[rgba(47,125,92,0.18)] bg-[var(--success-soft)] px-3.5 py-2.5 text-[0.8125rem] font-medium leading-5 text-[var(--success)]">
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
        </form>
      </section>
    </main>
  );
}
