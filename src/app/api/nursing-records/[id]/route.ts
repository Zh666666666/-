import { NextResponse } from "next/server";

import { markDemoNursingRecordRead } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { serializeNursingRecord } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";
import { accessiblePatientIds } from "@/lib/access-control";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.role !== "family") return NextResponse.json({ error: "Only the family may confirm reading" }, { status: 403 });

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
      ...(access.unrestricted ? {} : { patientId: { in: accessiblePatientIds(access) ?? [] } }),
    },
    select: { id: true },
  });
  if (!visibleRecord) {
    return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
  }

  // Replayed confirmations must preserve the first read timestamp.
  await prisma.nursingRecord.updateMany({
    where: { id, readAt: null, patientId: { in: accessiblePatientIds(access) ?? [] } },
    data: { readAt: new Date() },
  });
  const record = await prisma.nursingRecord.findFirst({
    where: { id, patientId: { in: accessiblePatientIds(access) ?? [] } },
  });

  if (!record) {
    return NextResponse.json({ error: "Nursing record not found" }, { status: 404 });
  }

  return NextResponse.json(serializeNursingRecord(record));
}
