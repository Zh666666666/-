import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800",
        destructive: "bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700",
        outline: "border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-950",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
        ghost: "hover:bg-slate-100 hover:text-slate-950",
        elder: "bg-emerald-600 text-white shadow-xl shadow-emerald-600/20 hover:bg-emerald-700",
      },
      size: {
        default: "h-12 px-5 py-2 text-base md:h-11 md:text-sm",
        sm: "h-11 rounded-xl px-3 text-sm md:h-9 md:rounded-lg",
        lg: "h-14 rounded-2xl px-7 text-base md:h-13 md:px-8",
        icon: "size-10",
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
