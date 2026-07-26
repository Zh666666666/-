import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "font-medium tracking-[-0.01em] select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45",
    "outline-none focus-visible:ring-2 focus-visible:ring-ink-700/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-ink-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(20,35,30,0.16),0_8px_20px_-10px_rgba(20,35,30,0.55)] hover:bg-ink-800 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_4px_rgba(20,35,30,0.16),0_14px_28px_-12px_rgba(20,35,30,0.6)]",
        brass:
          "bg-brass-400 text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_-10px_rgba(169,124,55,0.7)] hover:bg-brass-300",
        destructive:
          "bg-[var(--destructive)] text-white shadow-[0_8px_20px_-12px_rgba(176,67,56,0.8)] hover:brightness-[0.94]",
        outline:
          "border border-[var(--hairline-strong)] bg-[var(--surface)] text-ink-900 shadow-e1 hover:border-ink-700/35 hover:bg-sand-50",
        secondary: "bg-sage-100 text-sage-700 hover:bg-sage-100/70",
        ghost: "text-ink-800 hover:bg-[rgba(20,35,30,0.05)]",
        elder:
          "bg-sage-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_20px_-12px_rgba(60,101,82,0.75)] hover:bg-sage-700",
        success: "bg-[var(--success-soft)] text-emerald-800 hover:brightness-[0.97]",
        warning: "bg-[var(--warning-soft)] text-amber-900 hover:brightness-[0.97]",
      },
      size: {
        default: "h-11 rounded-lg px-4 text-[0.9375rem] md:h-10 md:text-sm",
        sm: "h-9 rounded-md px-3 text-[0.8125rem] md:h-8",
        lg: "h-12 rounded-lg px-6 text-base md:h-12 md:px-7",
        xl: "h-13 rounded-xl px-7 text-base",
        icon: "size-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
