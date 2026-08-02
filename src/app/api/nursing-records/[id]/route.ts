import { NextResponse } from "next/server";

import { markDemoNursingRecordRead } from "@/lib/demo-store";
import { updateOrNull } from "@/lib/api-errors";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { serializeNursingRecord } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isDemoMode()) {
    const record = markDemoNursingRecordRead(id);

    if (!record) {
      return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  }

  const visibleRecord = await prisma.nursingRecord.findFirst({
    where: {
      id,
      ...(access.unrestricted ? {} : { patientId: access.patientId ?? "__none__" }),
    },
    select: { id: true },
  });
  if (!visibleRecord) {
    return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
  }

  const record = await updateOrNull(prisma.nursingRecord.update({
    where: { id },
    data: { readAt: new Date() },
  }));

  if (!record) {
    return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
  }

  return NextResponse.json(serializeNursingRecord(record));
}
