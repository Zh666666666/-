import { NextResponse } from "next/server";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { getDashboardData } from "@/lib/data";

export async function GET() {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const dashboard = await getDashboardData();
    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Dashboard unavailable",
        code: "DASHBOARD_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
