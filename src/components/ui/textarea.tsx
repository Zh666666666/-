import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-2xl border border-[#d8c8ad] bg-[#fffaf2]/90 px-4 py-3 text-base text-[#17251f] shadow-sm placeholder:text-[#9a8a72] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#5b876f]/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-24 md:rounded-xl md:px-3 md:py-2 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
