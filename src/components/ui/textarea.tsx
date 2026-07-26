import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-[0.9375rem] leading-6 text-ink-900",
        "shadow-[inset_0_1px_2px_rgba(20,35,30,0.04)] transition-[border-color,box-shadow] duration-200",
        "placeholder:text-[var(--subtle-foreground)] hover:border-ink-700/25",
        "focus:border-ink-700/55 focus:shadow-[inset_0_1px_2px_rgba(20,35,30,0.03),0_0_0_3px_rgba(38,74,61,0.10)] focus:outline-none",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:min-h-24 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
