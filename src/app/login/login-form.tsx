"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { HeartPulse, LockKeyhole, LogIn, ShieldCheck, UserPlus, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultPathForRole, type UserRole } from "@/lib/auth";
import { isLocalAuthConfigured } from "@/lib/local-auth-config";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const roleOptions: Array<{ role: UserRole; title: string; description: string; icon: typeof UserRound }> = [
  { role: "family", title: "家属端", description: "看今日照护、护士建议和预约护理。", icon: HeartPulse },
  { role: "nurse", title: "护士端", description: "处理预警、指导和护理记录。", icon: ShieldCheck },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(isLocalAuthConfigured ? "" : "demo123456");
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
    setError(null);

    if (!role) {
      setError("请先选择家属端或护士端。");
      return;
    }

    setLoading(true);

    try {
      let authRole: UserRole;
      if (isLocalAuthConfigured) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role }),
        });
        const data = (await response.json()) as { role?: UserRole; error?: string };
        if (!response.ok || !data.role) throw new Error(data.error ?? "登录失败");
        authRole = data.role;
      } else if (isSupabaseConfigured && supabase) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          throw new Error(signInError.message);
        }
        authRole = await persistRole(role);
      } else {
        authRole = await persistRole(role);
      }
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
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe5] px-3 py-3 text-[#17251f] md:px-10 md:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_18%_12%,rgba(91,135,111,0.30),transparent_30rem),radial-gradient(circle_at_88%_4%,rgba(242,195,107,0.24),transparent_27rem)]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 rounded-full bg-[#9fc4b1]/25 blur-3xl" />

      <section className="family-view-enter relative mx-auto grid max-w-6xl items-start gap-3 md:min-h-[calc(100vh-4rem)] md:gap-6 lg:grid-cols-[1fr_28rem] lg:items-center">
        <div className="order-2 relative overflow-hidden rounded-[1.75rem] bg-[#17251f] p-4 text-white shadow-[0_24px_70px_rgba(23,37,31,0.22)] md:rounded-[2.5rem] md:p-10 md:shadow-[0_32px_90px_rgba(23,37,31,0.28)] lg:order-1">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#f2c36b]/24 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#f2c36b]/60 to-transparent" />
          <div className="relative min-h-[13rem] md:min-h-[32rem]">
            <div className="flex items-center justify-between gap-4">
              <Badge className="border border-white/15 bg-white/10 px-3 py-1 text-[#f8deb0] shadow-none">TKA Care OS</Badge>
              <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                <Link href="/">返回首页</Link>
              </Button>
            </div>

            <div className="mt-8 max-w-2xl md:mt-24">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-[#f2c36b]">Unified Portal</p>
              <h1 className="mt-4 font-display text-3xl font-bold leading-[1.05] tracking-[-0.05em] text-[#fff7e8] md:mt-5 md:text-7xl">
                家属和护士，各自进入自己的工作台。
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#d6e4da] md:mt-6 md:text-lg md:leading-9">
                登录后按角色进入对应工作台。家属查看今日照护安排，护士处理预警、指导和护理记录。
              </p>
            </div>

            <div className="mt-8 hidden gap-3 md:grid md:grid-cols-3">
              {[
                ["01", "今日照护", "先做当前最重要的一步"],
                ["02", "实时数据", "护膝数据自动入库"],
                ["03", "护理闭环", "指导、记录、复盘留痕"],
              ].map(([index, title, description]) => (
                <div key={index} className="rounded-[1.5rem] border border-white/12 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur">
                  <p className="text-xs font-black tracking-[0.18em] text-[#f2c36b]">{index}</p>
                  <p className="mt-3 text-lg font-black text-[#fff7e8]">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#c9dfd2]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 rounded-[1.75rem] border border-[#e1d3bd] bg-[#fffaf2]/90 p-3 shadow-[0_20px_55px_rgba(46,61,50,0.10)] backdrop-blur md:rounded-[2.25rem] md:p-6 md:shadow-[0_28px_80px_rgba(46,61,50,0.13)] lg:order-2">
          <div className="rounded-[1.35rem] border border-[#eadfce] bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:rounded-[1.75rem] md:p-6">
            <div className="mb-4 md:mb-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Secure Access</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#17251f] md:text-3xl">先选择登录端</h2>
              <p className="mt-2 text-sm leading-6 text-[#718174]">演示环境可直接进入；生产环境会使用配置好的认证服务。</p>
            </div>

            <form className="space-y-3 md:space-y-4" onSubmit={handleLogin}>
              <div className="grid gap-2 md:gap-3">
                {roleOptions.map((option, index) => {
                  const Icon = option.icon;
                  const selected = role === option.role;

                  return (
                    <button
                      key={option.role}
                      type="button"
                      className={cn(
                        "group flex items-center gap-2 rounded-[1.1rem] border p-2.5 text-left transition-all duration-300 md:gap-3 md:rounded-[1.35rem] md:p-3",
                        selected ? "border-[#17251f] bg-[#17251f] text-white shadow-[0_18px_45px_rgba(23,37,31,0.18)]" : "border-[#eadfce] bg-[#fffaf2]/80 text-[#17251f] hover:border-[#c7b18e] hover:bg-white",
                      )}
                      onClick={() => {
                        setRole(option.role);
                        if (!isLocalAuthConfigured) {
                          setEmail(option.role === "family" ? "family@demo.cn" : "nurse@demo.cn");
                        }
                      }}
                    >
                      <span className={cn("flex size-10 items-center justify-center rounded-xl transition md:size-12 md:rounded-2xl", selected ? "bg-[#f2c36b] text-[#17251f]" : "bg-[#edf2e7] text-[#5b876f]") }>
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="block text-base font-black">{option.title}</span>
                          <span className={cn("text-xs font-black tracking-[0.16em]", selected ? "text-[#f2c36b]" : "text-[#b0823d]")}>0{index + 1}</span>
                        </span>
                        <span className={cn("mt-0.5 block text-xs leading-5 sm:text-sm", selected ? "text-[#d6e4da]" : "text-[#718174]")}>{option.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-[#4c5b50]" htmlFor="email">邮箱</label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="border-[#d8c8ad] bg-[#fffaf2]/80 focus-visible:ring-[#5b876f]/20" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-[#4c5b50]" htmlFor="password">密码</label>
                  {isLocalAuthConfigured ? <Link href="/forgot-password" className="text-sm font-bold text-[#5b876f] hover:underline">忘记密码</Link> : null}
                </div>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="border-[#d8c8ad] bg-[#fffaf2]/80 focus-visible:ring-[#5b876f]/20" />
              </div>

              {!isSupabaseConfigured && !isLocalAuthConfigured ? (
                <p className="rounded-[1rem] border border-[#e4c47f] bg-[#fff1cf] px-3 py-2 text-xs leading-5 text-[#7a571b] md:rounded-[1.25rem] md:px-4 md:py-3 md:text-sm md:leading-6">当前启用演示登录，选择角色后可直接进入系统。</p>
              ) : null}
              {isLocalAuthConfigured ? (
                <p className="rounded-[1rem] border border-[#bdd8cb] bg-[#edf7f1] px-3 py-2 text-xs leading-5 text-[#285c43] md:rounded-[1.25rem] md:px-4 md:py-3 md:text-sm md:leading-6">当前使用本服务器账号认证。家属与护士账号相互隔离，连续错误登录会被临时限制。</p>
              ) : null}
              {error ? <p className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{error}</p> : null}

              <Button className="h-12 w-full rounded-[1rem] bg-[#17251f] text-sm text-white shadow-[0_16px_35px_rgba(23,37,31,0.18)] hover:bg-[#243d33] md:h-14 md:rounded-[1.25rem] md:text-base md:shadow-[0_20px_45px_rgba(23,37,31,0.20)]" size="lg" type="submit" disabled={loading || !role}>
                {loading ? <LockKeyhole className="size-5" /> : <LogIn className="size-5" />}
                {loading ? "正在登录" : role ? "登录并进入系统" : "先选择登录端"}
              </Button>
              {isLocalAuthConfigured ? (
                <Button asChild type="button" variant="outline" className="h-11 w-full border-[#cbb897] bg-white text-[#285c43] hover:bg-[#edf7f1]">
                  <Link href="/register"><UserPlus className="size-4" />使用邮箱注册家属账号</Link>
                </Button>
              ) : null}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
