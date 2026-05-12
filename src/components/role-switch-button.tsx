"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, isValidElement, useState } from "react";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";

type RoleSwitchButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  role: UserRole;
};

export function RoleSwitchButton({ role, children, disabled, ...props }: RoleSwitchButtonProps) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function switchRole() {
    setSwitching(true);

    try {
      const response = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error("Role switch failed");
      }

      const data = (await response.json()) as { redirectTo?: string };
      router.replace(data.redirectTo ?? "/login");
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  const pendingLabel = isValidElement(children) ? children : "正在切换";

  return (
    <Button {...props} disabled={disabled || switching} onClick={switchRole}>
      {switching ? pendingLabel : children}
    </Button>
  );
}
