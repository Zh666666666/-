import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full rounded-lg border border-[#cbd8e1] bg-white px-4 py-3 text-base text-[#142536] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#778896] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#087e8b]/20 disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:px-3 md:py-2 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
