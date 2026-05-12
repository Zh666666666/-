import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/data";

export async function GET() {
  const dashboard = await getDashboardData();

  return NextResponse.json(dashboard);
}
