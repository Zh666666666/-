import { NextResponse } from "next/server";
import { z } from "zod";

import { createAiAnalysisForPatient } from "@/lib/ai-analysis";

const analysisRequestSchema = z.object({
  patientId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = analysisRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI analysis payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const analysis = await createAiAnalysisForPatient(parsed.data.patientId);

  if (!analysis) {
    return NextResponse.json({ error: "Patient or knee record not found" }, { status: 404 });
  }

  return NextResponse.json(analysis);
}
