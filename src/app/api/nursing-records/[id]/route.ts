import { NextResponse } from "next/server";

import { markDemoNursingRecordRead } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { serializeNursingRecord } from "@/lib/rehab";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const record = markDemoNursingRecordRead(id);

    if (!record) {
      return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  }

  const record = await prisma.nursingRecord.update({
    where: { id },
    data: { readAt: new Date() },
  });

  return NextResponse.json(serializeNursingRecord(record));
}
