import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium leading-none tracking-[0.01em] transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink-900 text-white",
        secondary: "border-transparent bg-sand-200 text-ink-800",
        destructive: "border-[rgba(176,67,56,0.20)] bg-[var(--destructive-soft)] text-red-800",
        outline: "border-[var(--hairline-strong)] bg-transparent text-ink-800",
        success: "border-[rgba(47,125,92,0.20)] bg-[var(--success-soft)] text-emerald-800",
        warning: "border-[rgba(169,124,55,0.22)] bg-[var(--warning-soft)] text-amber-900",
        info: "border-[rgba(47,96,118,0.20)] bg-[var(--info-soft)] text-sky-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return <div data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
