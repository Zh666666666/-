"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, ChevronRight, FileCheck2, HeartPulse, Home, LogOut, Radio, ShieldCheck, Stethoscope, UserRound } from "lucide-react";

import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { isLocalAuthConfigured } from "@/lib/local-auth-config";
import { cn } from "@/lib/utils";

type RoleResponse = {
  role: UserRole | null;
};

const familyLinks = [
  { href: "/family", label: "首页", helper: "今日状态与提醒", icon: Home },
  { href: "/sensor-live", label: "正在测", helper: "设备数据同步", icon: Radio },
  { href: "/evidence", label: "训练记录", helper: "历史训练与复盘", icon: FileCheck2 },
  { href: "/family/devices", label: "设备连接", helper: "绑定与在线状态", icon: Activity },
  { href: "/appointments", label: "预约护理", helper: "联系护理服务", icon: CalendarClock },
  { href: "/family/profile", label: "我的", helper: "账号与个人信息", icon: UserRound },
];

const nurseLinks = [
  { href: "/nurse", label: "工作台", helper: "患者与待办总览", icon: Stethoscope },
  { href: "/sensor-live", label: "实时", helper: "双传感器数据", icon: Radio },
  { href: "/evidence", label: "回放", helper: "证据与训练复盘", icon: FileCheck2 },
  { href: "/appointments", label: "预约", helper: "护理排期管理", icon: CalendarClock },
  { href: "/nurse/profile", label: "资料", helper: "账号与执业信息", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/family" || href === "/nurse" || href === "/appointments") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RoleNavigation() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const response = await fetch("/api/auth/role", { cache: "no-store" });
      const data = (await response.json()) as RoleResponse;

      if (!cancelled) {
        setRole(data.role);
      }
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function switchRole(nextRole: UserRole) {
    setSwitching(true);

    try {
      const response = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await response.json()) as { redirectTo?: string };

      if (response.ok) {
        window.location.assign(data.redirectTo ?? "/login");
      }
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  if (!role || pathname === "/" || pathname === "/login" || pathname === "/register") {
    return null;
  }

  const links = role === "family" ? familyLinks : nurseLinks;
  const mobileLinks = role === "family" ? links.filter((item) => item.href !== "/appointments") : links;
  const oppositeRole: UserRole = role === "family" ? "nurse" : "family";
  const oppositeLabel = role === "family" ? "护士端" : "家属端";

  return (
    <>
      {/* ---------- 桌面端：持久左侧导航栏（应用骨架） ---------- */}
      <nav
        data-app-rail
        aria-label="主导航"
        className="panel-ink grain fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/8 md:flex"
      >
        <div className="relative z-10 flex h-full flex-col overflow-y-auto px-4 pb-5 pt-7">
          <Link href={role === "family" ? "/family" : "/nurse"} className="block px-2">
            <BrandLockup tone="light" subtitle={role === "family" ? "家庭照护工作台" : "病区护理工作台"} />
          </Link>

          <div className="mx-1 mt-5 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="status-beacon size-2 rounded-full bg-emerald-300" />
              <span className="truncate text-xs font-medium text-white/75">{role === "family" ? "家属照护视图" : "护理专业视图"}</span>
            </span>
            <ShieldCheck className="size-4 text-brass-300" aria-label="安全会话" />
          </div>

          <div className="mb-2 mt-6 flex items-center justify-between px-3">
            <p className="text-[0.625rem] font-semibold text-white/65">主要工作区</p>
            <span className="text-[0.625rem] text-white/60">{links.length} 项</span>
          </div>

          <div className="space-y-2">
            {links.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rail-link group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[0.875rem] font-medium transition-all duration-200",
                    active
                      ? "bg-sand-50 text-ink-900 shadow-e2"
                      : "text-white/75 hover:bg-white/[0.055] hover:text-white/90",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brass-400 transition-opacity duration-200",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border transition-colors", active ? "border-sage-300/40 bg-sage-100" : "border-transparent bg-white/[0.025]")}>
                    <Icon className={cn("size-4 transition-colors", active ? "text-sage-700" : "text-white/65 group-hover:text-white/70")} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-4">{item.label}</span>
                    <span className={cn("mt-0.5 block truncate text-[0.625rem] font-normal leading-4", active ? "text-muted-foreground" : "text-white/60")}>{item.helper}</span>
                  </span>
                  <ChevronRight className={cn("size-3.5 transition-all", active ? "translate-x-0 text-sage-700 opacity-100" : "-translate-x-1 text-white/60 opacity-0 group-hover:translate-x-0 group-hover:opacity-100")} />
                </Link>
              );
            })}
          </div>

          <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center gap-3 rounded-lg bg-black/10 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-xs font-semibold text-brass-200">
                {role === "family" ? "家" : "护"}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-white/75">{role === "family" ? "家属账号" : "护士账号"}</span>
                <span className="mt-0.5 block text-[0.625rem] text-white/65">数据仅对授权用户可见</span>
              </span>
            </div>
            {role === "nurse" && !isLocalAuthConfigured ? (
              <button
                type="button"
                onClick={() => switchRole(oppositeRole)}
                disabled={switching}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] font-medium text-white/75 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/85 disabled:opacity-50"
              >
                <HeartPulse className="size-4 text-white/65" />
                {switching ? "切换中…" : `切换到${oppositeLabel}`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] font-medium text-white/75 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/85"
            >
              <LogOut className="size-4 text-white/65" />
              退出登录
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- 移动端：底部导航坞 ---------- */}
      <nav
        aria-label="主导航"
        className={cn(
          "mobile-dock fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-[rgba(253,251,247,0.86)] px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1.5 backdrop-blur-xl md:hidden",
          "shadow-[0_-1px_0_rgba(255,255,255,0.7)_inset,0_-8px_24px_-12px_rgba(20,35,30,0.18)]",
        )}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-1.5">
          <div className="order-2 grid w-full grid-cols-5 gap-0.5">
            {mobileLinks.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[0.6875rem] font-medium transition-colors duration-200",
                    active ? "bg-sage-100/80 text-ink-900" : "text-[var(--muted-foreground)] hover:bg-sage-50 hover:text-ink-900",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -top-0.5 size-1 rounded-full bg-brass-500 transition-opacity duration-200",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              );
            })}
          </div>
          {role === "nurse" ? (
            <div className="order-1 grid grid-cols-2 gap-1">
              {!isLocalAuthConfigured ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => switchRole(oppositeRole)}
                  disabled={switching}
                  className="h-8 rounded-lg px-2 text-[0.75rem]"
                >
                  <HeartPulse className="size-3.5" />
                  {switching ? "切换中" : oppositeLabel}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={logout}
                className={cn("h-8 rounded-lg px-2 text-[0.75rem]", isLocalAuthConfigured && "col-span-2")}
              >
                <LogOut className="size-3.5" />
                退出
              </Button>
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}
