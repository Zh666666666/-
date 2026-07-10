import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-[#12304a] text-white shadow-sm hover:bg-[#1b4565]",
        destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
        outline: "border border-[#cbd8e1] bg-white text-[#17324a] hover:bg-[#f1f6f8] hover:text-[#17324a]",
        secondary: "bg-[#e5f1f2] text-[#075b69] hover:bg-[#d5e9eb]",
        ghost: "hover:bg-[#edf4f6] hover:text-[#12304a]",
        elder: "bg-[#087e8b] text-white shadow-sm hover:bg-[#056b76]",
      },
      size: {
        default: "h-12 px-5 py-2 text-base md:h-11 md:text-sm",
        sm: "h-10 rounded-md px-3 text-sm md:h-9",
        lg: "h-12 rounded-lg px-6 text-base md:h-12 md:px-7",
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
