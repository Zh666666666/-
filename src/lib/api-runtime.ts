import { NextResponse } from "next/server";

import { getRuntimeReadiness } from "@/lib/env";

export function runtimeUnavailableResponse() {
  const readiness = getRuntimeReadiness();

  if (readiness.ready) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Runtime configuration is not ready for persistent data access.",
      code: "RUNTIME_NOT_READY",
      mode: readiness.mode,
      issues: readiness.issues,
    },
    { status: 503 },
  );
}
