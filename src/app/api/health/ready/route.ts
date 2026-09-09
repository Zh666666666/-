import { NextResponse } from "next/server";

import { getRuntimeReadiness } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const readiness = getRuntimeReadiness();

  if (!readiness.ready) {
    return NextResponse.json(
      { status: "not-ready", ...readiness, checkedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  if (readiness.mode === "demo") {
    return NextResponse.json({
      status: "ready",
      ...readiness,
      storage: "process-memory-demo",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.patient.count();
    await prisma.gatewayCredential.count();

    return NextResponse.json({
      status: "ready",
      ...readiness,
      storage: "postgresql",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "not-ready",
        ...readiness,
        issues: ["The production database or application schema is unavailable."],
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
