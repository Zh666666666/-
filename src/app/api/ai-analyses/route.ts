import { NextResponse } from "next/server";
import { z } from "zod";

import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { calculateRehabMetrics } from "@/lib/rehab-metrics";
import { type AiAnalysisItem, type KneeDataPoint, type SensorSampleItem } from "@/lib/rehab";
import { readSampleProvenance } from "@/lib/sensor-receipt";

const analysisRequestSchema = z.object({
  patientId: z.string().min(1),
});

type AnalysisDraft = Pick<AiAnalysisItem, "provider" | "report" | "recommendation">;

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function responseEndpoint(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/responses` : `${base}/v1/responses`;
}

function extractResponseText(payload: ResponsesPayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text" && item.text)
    ?.text?.trim() ?? null;
}

function parseAnalysis(text: string, provider: string): AnalysisDraft {
  const unwrapped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(unwrapped) as { report?: unknown; recommendation?: unknown };
  if (typeof parsed.report !== "string" || typeof parsed.recommendation !== "string") {
    throw new Error("AI response did not contain report and recommendation strings");
  }
  return {
    provider,
    report: parsed.report.trim(),
    recommendation: parsed.recommendation.trim(),
  };
}

function rawMode(raw: unknown): SensorSampleItem["kneeAngleMode"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const mode = (raw as Record<string, unknown>).kneeAngleMode;
  return mode === "DUAL_SENSOR" || mode === "SINGLE_SENSOR_PROVISIONAL" || mode === "UNKNOWN"
    ? mode
    : null;
}

function metricSample(sample: {
  id: string;
  gatewaySampleId: string | null;
  patientId: string;
  deviceId: string | null;
  sessionId: string | null;
  placement: SensorSampleItem["placement"];
  placementRevision: number;
  source: SensorSampleItem["source"];
  recordedAt: Date;
  createdAt: Date;
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  flexionAngle: number | null;
  extensionAngle: number | null;
  confidence: number | null;
  raw: unknown;
}): SensorSampleItem {
  return {
    id: sample.id,
    ...readSampleProvenance(sample),
    patientId: sample.patientId,
    deviceId: sample.deviceId,
    sessionId: sample.sessionId,
    placement: sample.placement,
    placementRevision: sample.placementRevision,
    source: sample.source,
    recordedAt: sample.recordedAt.toISOString(),
    roll: sample.roll,
    pitch: sample.pitch,
    yaw: sample.yaw,
    ax: sample.ax,
    ay: sample.ay,
    az: sample.az,
    gx: sample.gx,
    gy: sample.gy,
    gz: sample.gz,
    flexionAngle: sample.flexionAngle,
    extensionAngle: sample.extensionAngle,
    confidence: sample.confidence,
    batteryLevel: null,
    signalStrength: null,
    kneeAngleMode: rawMode(sample.raw),
    clinicalEligible: typeof sample.confidence === "number" && sample.confidence >= 0.7,
  };
}

async function callResponsesApi(evidence: unknown): Promise<AnalysisDraft> {
  const baseUrl = process.env.AI_RESPONSES_BASE_URL ?? "https://api.openai.com";
  const model = process.env.AI_RESPONSES_MODEL ?? "gpt-5.5";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.AI_RESPONSES_API_KEY) {
    headers.Authorization = `Bearer ${process.env.AI_RESPONSES_API_KEY}`;
  }
  if (process.env.AI_RESPONSES_ACTOR_AUTHORIZATION) {
    headers["x-openai-actor-authorization"] = process.env.AI_RESPONSES_ACTOR_AUTHORIZATION;
  }

  const response = await fetch(responseEndpoint(baseUrl), {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: process.env.AI_RESPONSES_REASONING_EFFORT ?? "xhigh" },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "你是术后膝关节康复数据分析助手。",
                "只根据提供的已通过质量门的数据证据进行分析，不补造事实。",
                "输出严格 JSON：{\"report\":\"...\",\"recommendation\":\"...\"}。",
                "report 说明康复状态、数据依据、可信边界和需要人工复核之处。",
                "recommendation 给出通俗、可执行的训练与复核建议。",
                "不得诊断疾病，不得替代医生，不得擅自调整处方。",
              ].join(""),
            },
          ],
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: `请分析以下同一训练会话的结构化证据：\n${JSON.stringify(evidence)}`,
          }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Responses API returned ${response.status}: ${detail}`);
  }
  const payload = await response.json() as ResponsesPayload;
  const text = extractResponseText(payload);
  if (!text) throw new Error("Responses API returned no output text");
  return parseAnalysis(text, `responses:${model}`);
}

function serializeAnalysis(analysis: {
  id: string;
  patientId: string;
  patientName: string;
  flexionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore: number;
  provider: string;
  report: string;
  recommendation: string;
  createdAt: Date;
}): AiAnalysisItem {
  return { ...analysis, createdAt: analysis.createdAt.toISOString() };
}

export async function POST(request: Request) {
  const parsed = analysisRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI analysis payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "演示模式不调用外部 AI。请切换到真实硬件生产环境。", code: "HARDWARE_REQUIRED" },
      { status: 409 },
    );
  }

  const patientId = parsed.data.patientId;
  const [patient, session] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.sensorSession.findFirst({
      where: { patientId, source: "HARDWARE" },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  if (!patient || !session) {
    return NextResponse.json(
      { error: "尚无可分析的真实硬件训练会话。", code: "HARDWARE_SESSION_REQUIRED" },
      { status: 404 },
    );
  }

  const [samples, calibration, clinicalRecords] = await Promise.all([
    prisma.sensorSample.findMany({
      where: {
        patientId,
        sessionId: session.id,
        placementRevision: session.placementRevision,
        source: "HARDWARE",
      },
      orderBy: { recordedAt: "asc" },
      take: 2_000,
    }),
    prisma.calibrationRecord.findFirst({
      where: {
        patientId,
        placementRevision: session.placementRevision,
      },
      orderBy: { createdAt: "desc" },
      select: { quality: true, thighDeviceId: true, shankDeviceId: true },
    }),
    prisma.kneeDataRecord.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 12,
    }),
  ]);

  const serializedSamples = samples.map(metricSample);
  const records: KneeDataPoint[] = clinicalRecords.map((record) => ({
    ...record,
    recordedAt: record.recordedAt.toISOString(),
  })).reverse();
  const lastRecordedAt = samples.at(-1)?.recordedAt ?? session.endedAt ?? new Date();
  const metrics = calculateRehabMetrics({
    samples: serializedSamples,
    clinicalRecords: records,
    targetFlexion: patient.targetFlexion,
    calibration,
    now: lastRecordedAt,
  });

  if (!metrics.clinicalEligible) {
    return NextResponse.json({
      error: "本次训练数据未通过质量门，已阻止 AI 生成结论。",
      code: "QUALITY_GATE_FAILED",
      sessionId: session.id,
      placementRevision: session.placementRevision,
      quality: metrics.dataQuality,
    }, { status: 422 });
  }

  const evidenceSamples = serializedSamples
    .filter((_, index) => index % Math.max(1, Math.floor(serializedSamples.length / 80)) === 0)
    .slice(0, 80)
    .map((sample) => ({
      at: sample.recordedAt,
      placement: sample.placement,
      deviceId: sample.deviceId,
      roll: sample.roll,
      pitch: sample.pitch,
      yaw: sample.yaw,
      ax: sample.ax,
      ay: sample.ay,
      az: sample.az,
      gx: sample.gx,
      gy: sample.gy,
      gz: sample.gz,
      kneeAngle: sample.flexionAngle,
    }));
  const evidence = {
    boundary: "工程康复分析，非疾病诊断，不替代医生或治疗处方",
    patient: {
      id: patient.id,
      targetFlexion: patient.targetFlexion,
      surgicalSide: patient.surgicalSide,
      surgeryDate: patient.surgeryDate.toISOString(),
    },
    session: {
      id: session.id,
      status: session.status,
      placementRevision: session.placementRevision,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    },
    metrics,
    rawEvidence: evidenceSamples,
  };

  let draft: AnalysisDraft;
  try {
    draft = await callResponsesApi(evidence);
  } catch (error) {
    console.error("AI analysis failed", error);
    return NextResponse.json(
      { error: "AI 服务调用失败，质量指标已保留，请稍后重试。", code: "AI_PROVIDER_FAILED" },
      { status: 502 },
    );
  }

  const analysis = await prisma.aiAnalysis.create({
    data: {
      patientId: patient.id,
      patientName: patient.name,
      flexionAngle: metrics.rom.peakFlexion ?? 0,
      activityFrequency: metrics.training.repetitions ?? 0,
      activityDuration: Math.round((metrics.training.activeDurationSeconds ?? 0) / 60),
      painScore: records.filter((record) => record.source === "MANUAL").at(-1)?.painScore ?? 0,
      ...draft,
    },
  });
  return NextResponse.json({
    ...serializeAnalysis(analysis),
    sessionId: session.id,
    placementRevision: session.placementRevision,
    quality: metrics.dataQuality,
  });
}
