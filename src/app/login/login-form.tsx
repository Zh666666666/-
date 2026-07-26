"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, HeartPulse, ShieldCheck, UserPlus } from "lucide-react";

import { BrandLockup, RangeOfMotionDial } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultPathForRole, type UserRole } from "@/lib/auth";
import { isLocalAuthConfigured } from "@/lib/local-auth-config";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const roleOptions: Array<{ role: UserRole; title: string; description: string; icon: typeof HeartPulse }> = [
  { role: "family", title: "家属端", description: "今日照护 · 数据 · 预约", icon: HeartPulse },
  { role: "nurse", title: "护士端", description: "预警 · 指导 · 护理记录", icon: ShieldCheck },
];

const proofPoints = [
  ["01", "今日照护", "先做当前最重要的一步"],
  ["02", "实时数据", "护膝数据自动入库"],
  ["03", "护理闭环", "指导、记录、复盘留痕"],
] as const;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(isLocalAuthConfigured ? "" : "demo123456");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="min-h-[100dvh] bg-canvas text-ink-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(27rem,32rem)]">
      {/* ---------- 品牌面板 ---------- */}
      <aside className="panel-ink grain rim-light relative overflow-hidden rounded-b-3xl px-5 pb-8 pt-5 lg:flex lg:flex-col lg:justify-between lg:rounded-none lg:px-14 lg:py-12 xl:px-20">
        <div
          className="pointer-events-none absolute -right-32 top-1/2 hidden aspect-square w-[38rem] -translate-y-1/2 opacity-55 lg:block xl:w-[46rem]"
          aria-hidden="true"
        >
          <RangeOfMotionDial />
        </div>
        <div
          className="pointer-events-none absolute -right-16 -top-20 aspect-square w-64 opacity-30 lg:hidden"
          aria-hidden="true"
        >
          <RangeOfMotionDial />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          <BrandLockup tone="light" subtitle="术后康复监测平台" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[0.75rem] font-medium text-white/70 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
          >
            返回首页
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="relative z-10 mt-8 max-w-xl lg:mt-0">
          <p className="eyebrow rise text-brass-300" style={{ ["--i" as string]: 0 }}>
            Unified Portal
          </p>
          <h1
            className="display-xl rise mt-3.5 text-[1.9rem] text-[#f7f3ea] sm:text-[2.5rem] lg:mt-6 lg:text-[3.9rem] xl:text-[4.6rem]"
            style={{ ["--i" as string]: 1 }}
          >
            家属与护士，
            <br className="hidden sm:block" />
            各自进入自己的工作台。
          </h1>
          <p
            className="rise mt-4 max-w-lg text-[0.875rem] leading-6 text-white/60 lg:mt-7 lg:text-[1.0625rem] lg:leading-8"
            style={{ ["--i" as string]: 2 }}
          >
            登录后按角色进入对应工作台。家属查看今日照护安排，护士处理预警、指导与护理记录。
          </p>
        </div>

        <div
          className="rise relative z-10 mt-8 hidden border-t border-white/10 pt-7 lg:grid lg:grid-cols-3"
          style={{ ["--i" as string]: 3 }}
        >
          {proofPoints.map(([index, title, description], position) => (
            <div key={index} className={cn("pr-6", position > 0 && "border-l border-white/10 pl-6")}>
              <p className="serif-accent text-xl leading-none text-brass-400/90">{index}</p>
              <p className="mt-3 text-[0.9375rem] font-medium text-[#f7f3ea]">{title}</p>
              <p className="mt-1 text-[0.8125rem] leading-5 text-white/45">{description}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------- 登录面板 ---------- */}
      <section className="ambient relative flex items-center justify-center px-4 py-6 sm:px-6 lg:px-10 lg:py-12">
        <div className="veil relative z-10 w-full max-w-[26.5rem] rounded-2xl border border-[var(--hairline)] bg-white/80 p-5 shadow-e4 backdrop-blur-md sm:p-8">
          <header>
            <p className="eyebrow text-brass-700">Secure Access</p>
            <h2 className="display-md mt-3 text-[1.625rem] lg:text-[1.875rem]">选择登录身份</h2>
            <p className="mt-2.5 text-[0.875rem] leading-6 text-[var(--muted-foreground)]">
              演示环境可直接进入；生产环境使用配置好的认证服务。
            </p>
          </header>

          <form className="mt-7 space-y-5" onSubmit={handleLogin}>
            <div className="grid grid-cols-2 gap-2.5">
              {roleOptions.map((option) => {
                const Icon = option.icon;
                const selected = role === option.role;

                return (
                  <button
                    key={option.role}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border p-3.5 text-left transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      selected
                        ? "border-ink-900 bg-white shadow-[0_0_0_1px_var(--ink-900),0_12px_28px_-18px_rgba(20,35,30,0.7)]"
                        : "border-[var(--hairline-strong)] bg-sand-50 hover:border-ink-700/30 hover:bg-white",
                    )}
                    onClick={() => {
                      setRole(option.role);
                      if (!isLocalAuthConfigured) {
                        setEmail(option.role === "family" ? "family@demo.cn" : "nurse@demo.cn");
                      }
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-md transition-colors duration-250",
                        selected ? "bg-ink-900 text-brass-300" : "bg-sand-200 text-sage-600 group-hover:bg-sage-100",
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="mt-3 block text-[0.9375rem] font-semibold tracking-[-0.01em]">{option.title}</span>
                    <span className="mt-0.5 block text-[0.75rem] leading-4 text-[var(--muted-foreground)]">
                      {option.description}
                    </span>
                    <span
                      className={cn(
                        "absolute right-3 top-3 flex size-4.5 items-center justify-center rounded-full transition-all duration-250",
                        selected ? "scale-100 bg-brass-400 text-ink-900 opacity-100" : "scale-75 opacity-0",
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-[0.8125rem] font-medium text-[#4d5c53]" htmlFor="email">
                  邮箱
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <label className="block text-[0.8125rem] font-medium text-[#4d5c53]" htmlFor="password">
                    密码
                  </label>
                  {isLocalAuthConfigured ? (
                    <Link
                      href="/forgot-password"
                      className="text-[0.8125rem] font-medium text-sage-600 underline-offset-4 transition-colors hover:text-ink-800 hover:underline"
                    >
                      忘记密码
                    </Link>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--subtle-foreground)] transition-colors hover:bg-sand-100 hover:text-ink-800"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

            {!isSupabaseConfigured && !isLocalAuthConfigured ? (
              <p className="rounded-lg border border-[rgba(169,124,55,0.22)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-[0.8125rem] leading-5 text-[var(--brass-800)]">
                当前启用演示登录，选择角色后可直接进入系统。
              </p>
            ) : null}
            {isLocalAuthConfigured ? (
              <p className="rounded-lg border border-[rgba(47,125,92,0.18)] bg-[var(--success-soft)] px-3.5 py-2.5 text-[0.8125rem] leading-5 text-[var(--success)]">
                当前使用本服务器账号认证。家属与护士账号相互隔离，连续错误登录会被临时限制。
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

            <div className="space-y-2.5 pt-0.5">
              <Button className="group h-12 w-full text-[0.9375rem]" size="lg" type="submit" disabled={loading || !role}>
                {loading ? (
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white"
                  />
                ) : null}
                {loading ? "正在登录" : role ? "登录并进入系统" : "先选择登录身份"}
                {!loading && role ? (
                  <ArrowRight className="size-4 transition-transform duration-250 group-hover:translate-x-0.5" />
                ) : null}
              </Button>
              {isLocalAuthConfigured ? (
                <Button asChild type="button" variant="outline" className="h-11 w-full">
                  <Link href="/register">
                    <UserPlus className="size-4" />
                    使用邮箱注册家属账号
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>

          <p className="mt-7 flex items-center justify-center gap-2 border-t border-[var(--hairline)] pt-5 text-[0.75rem] text-[var(--subtle-foreground)]">
            <ShieldCheck className="size-3.5" />
            训练与护理数据仅对授权角色可见
          </p>
        </div>
      </section>
    </main>
  );
}
