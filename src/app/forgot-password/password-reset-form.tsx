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
    <main className="flex min-h-screen items-center justify-center bg-[#f4efe5] p-4 text-[#17251f]">
      <section className="w-full max-w-md rounded-lg border border-[#d8c8ad] bg-white p-6 shadow-xl">
        <Button asChild variant="ghost" size="sm"><Link href="/login"><ArrowLeft className="size-4" />返回登录</Link></Button>
        <ShieldCheck className="mt-6 size-9 text-[#5b876f]" />
        <h1 className="mt-3 text-3xl font-black">重置密码</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">家属和护士账号均可通过已绑定邮箱重置。</p>
        <form className="mt-6 space-y-4" onSubmit={reset}>
          <label className="block text-sm font-bold">邮箱<Input className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <Button type="button" variant="outline" className="w-full" onClick={send} disabled={busy || !email}><Mail className="size-4" />发送验证码</Button>
          {sent ? <>
            <label className="block text-sm font-bold">验证码<Input className="mt-2" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required /></label>
            <label className="block text-sm font-bold">新密码<Input className="mt-2" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <p className="text-xs text-slate-500">至少 12 位，包含字母和数字。</p>
            <Button className="w-full bg-[#17362d] text-white" type="submit" disabled={busy}>确认重置</Button>
          </> : null}
          {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
