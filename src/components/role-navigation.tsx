"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, FileCheck2, HeartPulse, Home, LogOut, Radio, Stethoscope, UserRound } from "lucide-react";

import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { isLocalAuthConfigured } from "@/lib/local-auth-config";
import { cn } from "@/lib/utils";

type RoleResponse = {
  role: UserRole | null;
};

const familyLinks = [
  { href: "/family", label: "监测", icon: Home },
  { href: "/sensor-live", label: "实时", icon: Radio },
  { href: "/family/devices", label: "设备", icon: Activity },
  { href: "/evidence", label: "回放", icon: FileCheck2 },
  { href: "/appointments", label: "预约", icon: CalendarClock },
  { href: "/family/profile", label: "资料", icon: UserRound },
];

const nurseLinks = [
  { href: "/nurse", label: "工作台", icon: Stethoscope },
  { href: "/sensor-live", label: "实时", icon: Radio },
  { href: "/evidence", label: "回放", icon: FileCheck2 },
  { href: "/appointments", label: "预约", icon: CalendarClock },
  { href: "/nurse/profile", label: "资料", icon: UserRound },
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
  const oppositeRole: UserRole = role === "family" ? "nurse" : "family";
  const oppositeLabel = role === "family" ? "护士端" : "家属端";

  return (
    <>
      {/* ---------- 桌面端：持久左侧导航栏（应用骨架） ---------- */}
      <nav
        data-app-rail
        aria-label="主导航"
        className="panel-ink grain fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/8 md:flex"
      >
        <div className="relative z-10 flex h-full flex-col px-4 pb-5 pt-6">
          <Link href={role === "family" ? "/family" : "/nurse"} className="block px-2">
            <BrandLockup tone="light" subtitle={role === "family" ? "家庭照护工作台" : "病区护理工作台"} />
          </Link>

          <div className="mt-7 space-y-0.5">
            {links.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.875rem] font-medium transition-colors duration-200",
                    active
                      ? "bg-white/[0.09] text-[#f7f3ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "text-white/55 hover:bg-white/[0.05] hover:text-white/85",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brass-400 transition-opacity duration-200",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon className={cn("size-4 transition-colors", active ? "text-brass-300" : "text-white/40 group-hover:text-white/70")} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
            <p className="px-3 text-[0.6875rem] tracking-[0.08em] text-white/35">
              {role === "family" ? "家属账号" : "护士账号"} · 数据仅授权可见
            </p>
            {role === "nurse" && !isLocalAuthConfigured ? (
              <button
                type="button"
                onClick={() => switchRole(oppositeRole)}
                disabled={switching}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] font-medium text-white/55 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/85 disabled:opacity-50"
              >
                <HeartPulse className="size-4 text-white/40" />
                {switching ? "切换中…" : `切换到${oppositeLabel}`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] font-medium text-white/55 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/85"
            >
              <LogOut className="size-4 text-white/40" />
              退出登录
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- 移动端：底部导航坞 ---------- */}
      <nav
        aria-label="主导航"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-[rgba(253,251,247,0.86)] px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1.5 backdrop-blur-xl md:hidden",
          "shadow-[0_-1px_0_rgba(255,255,255,0.7)_inset,0_-8px_24px_-12px_rgba(20,35,30,0.18)]",
        )}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-1.5">
          <div className={cn("order-2 grid w-full gap-0.5", role === "family" ? "grid-cols-6" : "grid-cols-5")}>
            {links.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[0.6875rem] font-medium transition-colors duration-200",
                    active ? "text-ink-900" : "text-[var(--muted-foreground)] hover:text-ink-900",
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
