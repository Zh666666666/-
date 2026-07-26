import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-3.5 text-[0.9375rem] text-ink-900",
        "shadow-[inset_0_1px_2px_rgba(20,35,30,0.04)] transition-[border-color,box-shadow,background-color] duration-200",
        "placeholder:text-[var(--subtle-foreground)]",
        "hover:border-ink-700/25",
        "focus:border-ink-700/55 focus:bg-white focus:shadow-[inset_0_1px_2px_rgba(20,35,30,0.03),0_0_0_3px_rgba(38,74,61,0.10)] focus:outline-none",
        "focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "md:h-10 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
