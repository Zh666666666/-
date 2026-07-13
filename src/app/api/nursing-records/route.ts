import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoNursingRecord } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { encodeNursingNotes, serializeNursingRecord } from "@/lib/rehab";

const soapSchema = z.object({
  subjective: z.string().optional().default(""),
  objective: z.string().optional().default(""),
  assessment: z.string().optional().default(""),
  plan: z.string().optional().default(""),
});

const nursingRecordSchema = z.object({
  patientId: z.string().min(1),
  nurseName: z.string().min(1).optional(),
  actionType: z.enum(["REMOTE_GUIDANCE", "PHONE_CALL", "HOME_VISIT", "REHAB_ADJUSTMENT", "MEDICATION_REMINDER"]).optional(),
  guidance: z.string().min(1),
  notes: z.string().optional().nullable(),
  soap: soapSchema.optional().nullable(),
  nextFollowUp: z.string().datetime().optional().nullable(),
});

export async function POST(request: Request) {
  const parsed = nursingRecordSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid nursing record payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

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
