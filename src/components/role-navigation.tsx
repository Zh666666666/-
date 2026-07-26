"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, FileCheck2, HeartPulse, Home, LogOut, Radio, Stethoscope, UserRound } from "lucide-react";

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
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-[rgba(253,251,247,0.86)] px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1.5 backdrop-blur-xl",
        "shadow-[0_-1px_0_rgba(255,255,255,0.7)_inset,0_-8px_24px_-12px_rgba(20,35,30,0.18)]",
        "md:inset-x-auto md:bottom-5 md:right-5 md:max-w-[calc(100vw-2.5rem)] md:rounded-full md:border md:px-2 md:py-2 md:shadow-e3",
      )}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-1.5 md:max-w-none md:flex-row md:items-center md:justify-start md:gap-1.5 md:overflow-x-auto">
        <div
          className={cn(
            "order-2 grid w-full gap-0.5 md:order-none md:flex md:w-auto md:items-center md:gap-1",
            role === "family" ? "grid-cols-6" : "grid-cols-5",
          )}
        >
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
                  "md:min-h-0 md:flex-none md:flex-row md:gap-1.5 md:rounded-full md:px-3.5 md:py-2 md:text-[0.8125rem]",
                  active
                    ? "text-ink-900 md:bg-ink-900 md:text-white md:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "text-[var(--muted-foreground)] hover:text-ink-900 md:hover:bg-[rgba(20,35,30,0.05)]",
                )}
              >
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -top-0.5 size-1 rounded-full bg-brass-500 transition-opacity duration-200 md:hidden",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            );
          })}
        </div>
        {role === "nurse" ? (
          <div className="order-1 grid grid-cols-2 gap-1 md:order-none md:flex md:gap-1 md:border-l md:border-[var(--hairline)] md:pl-1.5">
            {!isLocalAuthConfigured ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => switchRole(oppositeRole)}
                disabled={switching}
                className="h-8 rounded-lg px-2 text-[0.75rem] md:h-9 md:rounded-full md:px-3"
              >
                <HeartPulse className="size-3.5 md:size-4" />
                {switching ? "切换中" : oppositeLabel}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={logout}
              className={cn(
                "h-8 rounded-lg px-2 text-[0.75rem] md:h-9 md:rounded-full md:px-3",
                isLocalAuthConfigured && "col-span-2",
              )}
            >
              <LogOut className="size-3.5 md:size-4" />
              退出
            </Button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
