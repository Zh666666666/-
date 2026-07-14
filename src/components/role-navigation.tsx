"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, FileCheck2, HeartPulse, Home, LogOut, Radio, Stethoscope, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
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

  if (!role || pathname === "/" || pathname === "/login") {
    return null;
  }

  const links = role === "family" ? familyLinks : nurseLinks;
  const oppositeRole: UserRole = role === "family" ? "nurse" : "family";
  const oppositeLabel = role === "family" ? "护士端" : "家属端";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d9e2e9] bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1.5 shadow-[0_-4px_18px_rgba(20,45,65,0.10)] backdrop-blur-xl md:inset-x-auto md:bottom-5 md:right-5 md:max-w-[calc(100vw-2.5rem)] md:rounded-lg md:border md:px-3 md:pb-2 md:pt-2">
      <div className="mx-auto flex max-w-lg flex-col gap-1.5 md:max-w-none md:flex-row md:items-center md:justify-start md:gap-2 md:overflow-x-auto">
        <div className={cn("order-2 grid w-full gap-1 md:order-none md:flex md:w-auto md:items-center md:gap-2", role === "family" ? "grid-cols-6" : "grid-cols-5")}>
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-bold transition-colors md:min-h-0 md:flex-none md:flex-row md:gap-1.5 md:px-3 md:py-2 md:text-sm",
                  active ? "bg-[#12304a] text-white shadow-sm" : "text-[#647889] hover:bg-[#edf4f6] hover:text-[#12304a]",
                )}
              >
                <Icon className="size-4 md:size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
        {role === "nurse" ? (
          <div className="order-1 grid grid-cols-2 gap-1 md:order-none md:flex md:gap-2">
            <Button size="sm" variant="outline" onClick={() => switchRole(oppositeRole)} disabled={switching} className="h-8 rounded-md px-2 text-xs md:h-9 md:px-3">
              <HeartPulse className="size-3.5 md:size-4" />
              {switching ? "切换中" : oppositeLabel}
            </Button>
            <Button size="sm" variant="secondary" onClick={logout} className="h-8 rounded-md px-2 text-xs md:h-9 md:px-3">
              <LogOut className="size-3.5 md:size-4" />
              退出
            </Button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
