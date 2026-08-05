import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoNursingRecord } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { encodeNursingNotes, serializeNursingRecord } from "@/lib/rehab";
import { getDataAccessContext } from "@/lib/server-access";

const soapSchema = z.object({
  subjective: z.string().max(2000).optional().default(""),
  objective: z.string().max(2000).optional().default(""),
  assessment: z.string().max(2000).optional().default(""),
  plan: z.string().max(2000).optional().default(""),
});

const nursingRecordSchema = z.object({
  patientId: z.string().min(1).max(128),
  nurseName: z.string().min(1).max(80).optional(),
  actionType: z.enum(["REMOTE_GUIDANCE", "PHONE_CALL", "HOME_VISIT", "REHAB_ADJUSTMENT", "MEDICATION_REMINDER"]).optional(),
  guidance: z.string().min(1).max(4000),
  notes: z.string().max(4000).optional().nullable(),
  soap: soapSchema.optional().nullable(),
  nextFollowUp: z.string().datetime().optional().nullable(),
});

export async function POST(request: Request) {
  const parsed = nursingRecordSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid nursing record payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  const access = await getDataAccessContext();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.role !== "nurse") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (isDemoMode()) {
    return NextResponse.json(addDemoNursingRecord(body));
  }

  const record = await prisma.nursingRecord.create({
    data: {
      patientId: body.patientId,
      nurseName: body.nurseName ?? "康复护士",
      actionType: body.actionType ?? "REMOTE_GUIDANCE",
      guidance: body.guidance,
      notes: encodeNursingNotes(body.notes, body.soap ?? null),
      nextFollowUp: body.nextFollowUp ? new Date(body.nextFollowUp) : null,
    },
  });

  return NextResponse.json(serializeNursingRecord(record));
}
