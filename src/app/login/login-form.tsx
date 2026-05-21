"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { HeartPulse, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { defaultPathForRole, type UserRole } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const roleOptions: Array<{ role: UserRole; title: string; description: string; icon: typeof UserRound }> = [
  { role: "family", title: "家属端", description: "查看家人康复数据、指导建议和预约护理。", icon: HeartPulse },
  { role: "nurse", title: "护士端", description: "实时监测家人康复、处理预警和远程指导。", icon: ShieldCheck },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<UserRole>("family");
  const [email, setEmail] = useState("family@demo.cn");
  const [password, setPassword] = useState("demo123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persistRole(nextRole: UserRole) {
    const response = await fetch("/api/auth/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = (await response.json()) as { role?: UserRole; error?: string };

    if (!response.ok || !data.role) {
      throw new Error(data.error ?? "角色写入失败");
    }

    return data.role;
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase Auth 未配置，请先设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const authRole = await persistRole(role);
      const next = searchParams.get("next");
      const safeNext = next?.startsWith(defaultPathForRole(authRole)) ? next : defaultPathForRole(authRole);
      router.replace(safeNext);
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请检查账号和密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="rehab-grid flex min-h-screen items-center justify-center px-3 py-4 text-slate-950 sm:px-5 sm:py-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-sky-100 bg-white/92 shadow-2xl shadow-sky-950/10 backdrop-blur lg:grid-cols-[1fr_440px] lg:rounded-[2rem]">
        <div className="relative hidden min-h-[620px] overflow-hidden bg-slate-950 p-10 text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.32),transparent_28rem),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.22),transparent_24rem)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <Badge className="bg-emerald-400 text-emerald-950">Supabase Auth</Badge>
              <h1 className="mt-8 font-display text-6xl font-bold leading-tight">TKA 康复监测管理平台</h1>
              <p className="mt-6 max-w-xl text-xl leading-9 text-slate-300">统一登录入口会根据角色进入家属端或护士端，并由中间件保护不同角色的访问边界。</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <HeartPulse className="size-8 text-emerald-300" />
                <p className="mt-4 text-lg font-bold">家属端</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">零操作采集、温暖提醒、预约护理。</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <ShieldCheck className="size-8 text-sky-300" />
                <p className="mt-4 text-lg font-bold">护士端</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">实时仪表盘、AI 预警、护理闭环。</p>
              </div>
            </div>
          </div>
        </div>

        <Card className="rounded-none border-0 bg-transparent shadow-none">
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">安全登录</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">选择角色并登录</h2>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl px-3">
                <Link href="/">返回</Link>
              </Button>
            </div>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="grid gap-3">
                {roleOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = role === option.role;

                  return (
                    <button
                      key={option.role}
                      type="button"
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                        selected ? "border-sky-400 bg-sky-50 shadow-lg shadow-sky-950/10" : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                      onClick={() => {
                        setRole(option.role);
                        setEmail(option.role === "family" ? "family@demo.cn" : "nurse@demo.cn");
                      }}
                    >
                      <span className={cn("flex size-11 items-center justify-center rounded-2xl", selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600")}>
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block text-base font-black">{option.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500 sm:text-sm">{option.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-600" htmlFor="email">邮箱</label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-600" htmlFor="password">密码</label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>

              {!isSupabaseConfigured ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 sm:text-sm">当前未配置 Supabase Auth，请配置环境变量后登录。</p>
              ) : null}
              {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700 sm:text-sm">{error}</p> : null}

              <Button className="w-full" size="lg" type="submit" disabled={loading || !isSupabaseConfigured}>
                {loading ? <LockKeyhole className="size-5" /> : <LogIn className="size-5" />}
                {loading ? "正在登录" : "登录并进入系统"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
