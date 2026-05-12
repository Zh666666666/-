"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, Home, LogOut, Stethoscope, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

type RoleResponse = {
  role: UserRole | null;
};

const patientLinks = [
  { href: "/elder", label: "监测", icon: Home },
  { href: "/elder/guidance", label: "指导", icon: Activity },
  { href: "/elder/devices", label: "设备", icon: Activity },
  { href: "/appointments", label: "预约", icon: CalendarClock },
  { href: "/elder/profile", label: "资料", icon: UserRound },
];

const nurseLinks = [
  { href: "/nurse", label: "工作台", icon: Stethoscope },
  { href: "/appointments", label: "预约", icon: CalendarClock },
  { href: "/nurse/profile", label: "资料", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/elder" || href === "/nurse" || href === "/appointments") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RoleNavigation() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  if (!role || pathname === "/" || pathname === "/login") {
    return null;
  }

  const links = role === "patient" ? patientLinks : nurseLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/70 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-18px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl md:inset-x-auto md:bottom-5 md:right-5 md:max-w-[calc(100vw-2.5rem)] md:rounded-3xl md:border md:px-3 md:pb-2">
      <div className="mx-auto flex max-w-lg flex-col gap-2 md:max-w-none md:flex-row md:items-center md:justify-start md:gap-2 md:overflow-x-auto">
        <div className={cn("order-2 grid w-full gap-1 md:order-none md:flex md:w-auto md:items-center md:gap-2", role === "patient" ? "grid-cols-5" : "grid-cols-3")}>
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-[12px] font-black transition-all md:min-h-0 md:flex-none md:flex-row md:gap-1.5 md:px-3 md:py-2 md:text-sm",
                  active ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-800",
                )}
              >
                <Icon className="size-5 md:size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <Button size="sm" variant="secondary" onClick={logout} className="hidden shrink-0 rounded-2xl md:inline-flex">
          <LogOut className="size-4" />
          退出
        </Button>
      </div>
    </nav>
  );
}
