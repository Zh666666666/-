import { NextResponse } from "next/server";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { getDashboardData } from "@/lib/data";
import { getDataAccessContext } from "@/lib/server-access";

export async function GET() {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const access = await getDataAccessContext();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const dashboard = await getDashboardData(access.unrestricted ? undefined : access.patientId ?? "__none__");
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Dashboard query failed", error instanceof Error ? error.name : "unknown error");
    return NextResponse.json(
      {
        error: "Dashboard unavailable",
        code: "DASHBOARD_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
