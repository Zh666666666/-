import { NextResponse } from "next/server";

import { resolveAppMode } from "@/lib/env";

export function GET() {
  return NextResponse.json({
    status: "live",
    mode: resolveAppMode(),
    checkedAt: new Date().toISOString(),
  });
}
