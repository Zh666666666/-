import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:rounded-xl md:px-3 md:py-2 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
