import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-[#17251f] text-white shadow-[0_16px_36px_rgba(23,37,31,0.18)] hover:bg-[#243d33]",
        destructive: "bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700",
        outline: "border border-[#d8c8ad] bg-[#fffaf2]/80 text-[#17251f] hover:bg-white hover:text-[#17251f]",
        secondary: "bg-[#edf2e7] text-[#315242] hover:bg-[#e2eadf]",
        ghost: "hover:bg-[#edf2e7] hover:text-[#17251f]",
        elder: "bg-[#2f6f55] text-white shadow-[0_18px_40px_rgba(47,111,85,0.20)] hover:bg-[#245b46]",
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
