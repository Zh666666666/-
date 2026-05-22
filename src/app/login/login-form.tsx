"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { HeartPulse, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultPathForRole, type UserRole } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const roleOptions: Array<{ role: UserRole; title: string; description: string; icon: typeof UserRound }> = [
  { role: "family", title: "家属端", description: "看今日照护、护士建议和预约护理。", icon: HeartPulse },
  { role: "nurse", title: "护士端", description: "处理预警、指导和护理质量闭环。", icon: ShieldCheck },
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
      if (isSupabaseConfigured && supabase) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          throw new Error(signInError.message);
        }
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
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe5] px-4 py-5 text-[#17251f] md:px-10 md:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_18%_12%,rgba(91,135,111,0.30),transparent_30rem),radial-gradient(circle_at_88%_4%,rgba(242,195,107,0.24),transparent_27rem)]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 rounded-full bg-[#9fc4b1]/25 blur-3xl" />

      <section className="family-view-enter relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1fr_28rem]">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[#17251f] p-6 text-white shadow-[0_32px_90px_rgba(23,37,31,0.28)] md:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#f2c36b]/24 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#f2c36b]/60 to-transparent" />
          <div className="relative min-h-[32rem]">
            <div className="flex items-center justify-between gap-4">
              <Badge className="border border-white/15 bg-white/10 px-3 py-1 text-[#f8deb0] shadow-none">TKA Care OS</Badge>
              <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                <Link href="/">返回首页</Link>
              </Button>
            </div>

            <div className="mt-16 max-w-2xl md:mt-24">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-[#f2c36b]">Unified Portal</p>
              <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-[-0.05em] text-[#fff7e8] md:text-7xl">
                一个入口，分清家属照护和护士工作台。
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#d6e4da] md:text-lg md:leading-9">
                登录后按角色进入对应工作台。家属看到今日照护路线，护士处理预警、指导和护理质量闭环。
              </p>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-3">
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

        <div className="rounded-[2.25rem] border border-[#e1d3bd] bg-[#fffaf2]/90 p-4 shadow-[0_28px_80px_rgba(46,61,50,0.13)] backdrop-blur md:p-6">
          <div className="rounded-[1.75rem] border border-[#eadfce] bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:p-6">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Secure Access</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#17251f]">选择角色登录</h2>
              <p className="mt-2 text-sm leading-6 text-[#718174]">演示环境可直接进入；生产环境会使用配置好的认证服务。</p>
            </div>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="grid gap-3">
                {roleOptions.map((option, index) => {
                  const Icon = option.icon;
                  const selected = role === option.role;

                  return (
                    <button
                      key={option.role}
                      type="button"
                      className={cn(
                        "group flex items-center gap-3 rounded-[1.35rem] border p-3 text-left transition-all duration-300",
                        selected ? "border-[#17251f] bg-[#17251f] text-white shadow-[0_18px_45px_rgba(23,37,31,0.18)]" : "border-[#eadfce] bg-[#fffaf2]/80 text-[#17251f] hover:border-[#c7b18e] hover:bg-white",
                      )}
                      onClick={() => {
                        setRole(option.role);
                        setEmail(option.role === "family" ? "family@demo.cn" : "nurse@demo.cn");
                      }}
                    >
                      <span className={cn("flex size-12 items-center justify-center rounded-2xl transition", selected ? "bg-[#f2c36b] text-[#17251f]" : "bg-[#edf2e7] text-[#5b876f]") }>
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
                <label className="text-sm font-bold text-[#4c5b50]" htmlFor="password">密码</label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="border-[#d8c8ad] bg-[#fffaf2]/80 focus-visible:ring-[#5b876f]/20" />
              </div>

              {!isSupabaseConfigured ? (
                <p className="rounded-[1.25rem] border border-[#e4c47f] bg-[#fff1cf] px-4 py-3 text-sm leading-6 text-[#7a571b]">当前启用演示登录，选择角色后可直接进入系统。</p>
              ) : null}
              {error ? <p className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{error}</p> : null}

              <Button className="h-14 w-full rounded-[1.25rem] bg-[#17251f] text-base text-white shadow-[0_20px_45px_rgba(23,37,31,0.20)] hover:bg-[#243d33]" size="lg" type="submit" disabled={loading}>
                {loading ? <LockKeyhole className="size-5" /> : <LogIn className="size-5" />}
                {loading ? "正在登录" : "登录并进入系统"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
