import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoAiAnalysis } from "@/lib/demo-store";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { type AiAnalysisItem, type KneeDataPoint, type PatientSummary } from "@/lib/rehab";

const analysisRequestSchema = z.object({
  patientId: z.string().min(1),
});

type AnalysisDraft = Pick<AiAnalysisItem, "provider" | "report" | "recommendation">;

function localAnalysis(patient: PatientSummary, record: KneeDataPoint): AnalysisDraft {
  const risks = [
    record.flexionAngle < 78 ? `屈曲角度 ${record.flexionAngle.toFixed(0)}° 低于 78° 风险阈值` : null,
    record.activityFrequency < 6 ? `训练频次 ${record.activityFrequency} 次偏低` : null,
    record.activityDuration < 18 ? `训练时长 ${record.activityDuration} 分钟不足` : null,
    record.painScore >= 7 ? `疼痛评分 ${record.painScore} 分偏高` : null,
  ].filter(Boolean);

  const riskText = risks.length ? risks.join("；") : "当前关键指标未触发高危阈值";

  return {
    provider: "local-rule",
    report: `${patient.name} 当前屈曲 ${record.flexionAngle.toFixed(0)}°，训练 ${record.activityFrequency} 次、累计 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。${riskText}。`,
    recommendation: record.flexionAngle < 78 || record.painScore >= 7
      ? "建议护士优先远程复核疼痛、肿胀和动作质量，今日训练改为短时多组，必要时安排线下评估。"
      : "建议维持主动屈膝与股四头肌训练，继续观察角度趋势和训练依从性，疼痛升高时及时暂停。",
  };
}

function parseAiJson(text: string, provider: string): AnalysisDraft {
  try {
    const parsed = JSON.parse(text) as Partial<AnalysisDraft>;

    if (parsed.report && parsed.recommendation) {
      return {
        provider,
        report: parsed.report,
        recommendation: parsed.recommendation,
      };
    }
  } catch {
    return {
      provider,
      report: text.trim(),
      recommendation: "请护士结合患者疼痛、肿胀和步态表现复核后执行。",
    };
  }

  return {
    provider,
    report: text.trim(),
    recommendation: "请护士结合患者疼痛、肿胀和步态表现复核后执行。",
  };
}

async function callOpenAi(patient: PatientSummary, record: KneeDataPoint): Promise<AnalysisDraft | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士和患者都能理解。",
        },
        {
          role: "user",
          content: `患者：${patient.name}，术后目标屈曲 ${patient.targetFlexion}°。最新数据：屈曲 ${record.flexionAngle}°，伸直 ${record.extensionAngle}°，训练频次 ${record.activityFrequency} 次，训练时长 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。请生成关节康复分析和建议。`,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  return content ? parseAiJson(content, "openai") : null;
}

async function callAnthropic(patient: PatientSummary, record: KneeDataPoint): Promise<AnalysisDraft | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      temperature: 0.3,
      system: "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士和患者都能理解。",
      messages: [
        {
          role: "user",
          content: `患者：${patient.name}，术后目标屈曲 ${patient.targetFlexion}°。最新数据：屈曲 ${record.flexionAngle}°，伸直 ${record.extensionAngle}°，训练频次 ${record.activityFrequency} 次，训练时长 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。请生成关节康复分析和建议。`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  const content = payload.content?.find((item) => item.type === "text")?.text;
  return content ? parseAiJson(content, "anthropic") : null;
}

async function generateAnalysis(patient: PatientSummary, record: KneeDataPoint) {
  return (await callOpenAi(patient, record)) ?? (await callAnthropic(patient, record)) ?? localAnalysis(patient, record);
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
  return {
    ...analysis,
    createdAt: analysis.createdAt.toISOString(),
  };
}

export async function POST(request: Request) {
  const parsed = analysisRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI analysis payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { patientId } = parsed.data;

  if (!hasUsableDatabaseUrl()) {
    const { getDemoDashboardData } = await import("@/lib/demo-store");
    const dashboard = getDemoDashboardData();
    const patient = dashboard.patients.find((item) => item.id === patientId);
    const record = dashboard.records.filter((item) => item.patientId === patientId).at(-1);

    if (!patient || !record) {
      return NextResponse.json({ error: "Patient or knee record not found" }, { status: 404 });
    }

    const draft = await generateAnalysis(patient, record);
    return NextResponse.json(addDemoAiAnalysis({
      patientId: patient.id,
      patientName: patient.name,
      flexionAngle: record.flexionAngle,
      activityFrequency: record.activityFrequency,
      activityDuration: record.activityDuration,
      painScore: record.painScore,
      ...draft,
    }));
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  const record = await prisma.kneeDataRecord.findFirst({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
  });

  if (!patient || !record) {
    return NextResponse.json({ error: "Patient or knee record not found" }, { status: 404 });
  }

  const patientSummary: PatientSummary = {
    id: patient.id,
    medicalRecordNo: patient.medicalRecordNo,
    name: patient.name,
    age: patient.age,
    roomNumber: patient.roomNumber,
    surgeryDate: patient.surgeryDate.toISOString(),
    surgicalSide: patient.surgicalSide,
    targetFlexion: patient.targetFlexion,
    status: patient.status,
    riskLevel: patient.riskLevel,
  };
  const kneeRecord: KneeDataPoint = {
    id: record.id,
    patientId: record.patientId,
    flexionAngle: record.flexionAngle,
    extensionAngle: record.extensionAngle,
    activityFrequency: record.activityFrequency,
    activityDuration: record.activityDuration,
    painScore: record.painScore,
    batteryLevel: record.batteryLevel,
    signalStrength: record.signalStrength,
    source: record.source,
    recordedAt: record.recordedAt.toISOString(),
  };
  const draft = await generateAnalysis(patientSummary, kneeRecord);
  const analysis = await prisma.aiAnalysis.create({
    data: {
      patientId: patient.id,
      patientName: patient.name,
      flexionAngle: record.flexionAngle,
      activityFrequency: record.activityFrequency,
      activityDuration: record.activityDuration,
      painScore: record.painScore,
      ...draft,
    },
  });

  return NextResponse.json(serializeAnalysis(analysis));
}
