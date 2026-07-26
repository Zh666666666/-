import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type StatusNoticeTone = "success" | "error" | "info";

export function StatusNotice({ tone = "info", children }: { tone?: StatusNoticeTone; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;

  return (
    <p
      className={cn(
        "inline-flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] font-medium leading-5",
        tone === "success" ? "border-[rgba(47,125,92,0.20)] bg-[var(--success-soft)] text-emerald-800" : "",
        tone === "error" ? "border-[rgba(176,67,56,0.20)] bg-[var(--destructive-soft)] text-red-800" : "",
        tone === "info" ? "border-[rgba(47,96,118,0.20)] bg-[var(--info-soft)] text-sky-800" : "",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
