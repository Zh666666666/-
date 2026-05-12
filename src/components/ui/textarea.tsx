import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-24 md:rounded-xl md:px-3 md:py-2 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
