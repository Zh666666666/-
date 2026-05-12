import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type StatusNoticeTone = "success" | "error" | "info";

export function StatusNotice({ tone = "info", children }: { tone?: StatusNoticeTone; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;

  return (
    <p
      className={cn(
        "inline-flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6",
        tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "",
        tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "",
        tone === "info" ? "border-sky-200 bg-sky-50 text-sky-800" : "",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
