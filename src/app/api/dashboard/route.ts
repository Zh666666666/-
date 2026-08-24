import { NextResponse } from "next/server";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { getDashboardData } from "@/lib/data";
import { accessiblePatientIds } from "@/lib/access-control";
import { getDataAccessContext } from "@/lib/server-access";

export async function GET() {
  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    const access = await getDataAccessContext();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const dashboard = await getDashboardData(accessiblePatientIds(access));
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
