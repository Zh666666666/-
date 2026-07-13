import { NextResponse } from "next/server";
import { z } from "zod";

import { addDemoAiAnalysis } from "@/lib/demo-store";
import { runtimeUnavailableResponse } from "@/lib/api-runtime";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { type AiAnalysisItem, type KneeDataPoint, type PatientSummary } from "@/lib/rehab";

const analysisRequestSchema = z.object({
  patientId: z.string().min(1),
});

type AnalysisDraft = Pick<AiAnalysisItem, "provider" | "report" | "recommendation">;

function sourceLabel(source: KneeDataPoint["source"]) {
  switch (source) {
    case "HARDWARE":
      return "真实硬件";
    case "DEMO":
      return "演示数据";
    case "SMART_BRACE":
      return "智能护具";
    case "MANUAL":
      return "人工录入";
    default:
      return source;
  }
}

function localAnalysis(patient: PatientSummary, record: KneeDataPoint): AnalysisDraft {
  const risks = [
    record.flexionAngle < 78 ? `屈曲角度 ${record.flexionAngle.toFixed(0)}° 低于 78° 风险阈值` : null,
    record.activityFrequency < 6 ? `训练频次 ${record.activityFrequency} 次偏低` : null,
    record.activityDuration < 18 ? `训练时长 ${record.activityDuration} 分钟不足` : null,
    record.painScore >= 7 ? `疼痛评分 ${record.painScore} 分偏高` : null,
  ].filter(Boolean);

  const riskText = risks.length ? risks.join("；") : "当前关键指标未触发高危阈值";
  const provenance = `数据来源：${sourceLabel(record.source)}；仅使用已进入临床趋势的膝角记录（置信度≥0.7 的双传感器聚合）。单传感器临时读数不参与分析。`;

  return {
    provider: "local-rule",
    report: `${patient.name} 当前屈曲 ${record.flexionAngle.toFixed(0)}°，训练 ${record.activityFrequency} 次、累计 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。${riskText}。${provenance}`,
    recommendation: record.flexionAngle < 78 || record.painScore >= 7
      ? "建议护士优先远程复核疼痛、肿胀、动作质量和家属照护压力；先安抚再解释风险，今日训练改为短时多组，必要时安排线下评估。"
      : "建议维持主动屈膝与股四头肌训练，继续观察角度趋势、训练依从性和家属陪练反馈；疼痛升高时及时暂停并同步护士。",
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
          content: "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士、患者和家属都能理解。建议必须体现先安抚、再评估、再干预，并说明家属如何安全陪伴。",
        },
        {
          role: "user",
          content: `患者：${patient.name}，术后目标屈曲 ${patient.targetFlexion}°。数据来源：${sourceLabel(record.source)}（仅临床趋势记录，不含单传感器临时读数）。最新数据：屈曲 ${record.flexionAngle}°，伸直 ${record.extensionAngle}°，训练频次 ${record.activityFrequency} 次，训练时长 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。请生成关节康复分析和建议，并在 report 中点明数据来源与可信边界。`,
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
      model: "claude-opus-4-8",
      max_tokens: 600,
      temperature: 0.3,
      system: "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士、患者和家属都能理解。建议必须体现先安抚、再评估、再干预，并说明家属如何安全陪伴。分析仅基于已进入临床趋势的膝角记录，不得把单传感器临时读数当临床结论。",
      messages: [
        {
          role: "user",
          content: `患者：${patient.name}，术后目标屈曲 ${patient.targetFlexion}°。数据来源：${sourceLabel(record.source)}（仅临床趋势记录，不含单传感器临时读数）。最新数据：屈曲 ${record.flexionAngle}°，伸直 ${record.extensionAngle}°，训练频次 ${record.activityFrequency} 次，训练时长 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。请生成关节康复分析和建议，并在 report 中点明数据来源与可信边界。`,
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

  const unavailable = runtimeUnavailableResponse();
  if (unavailable) return unavailable;

  if (isDemoMode()) {
    const { getDemoDashboardData } = await import("@/lib/demo-store");
    const dashboard = getDemoDashboardData();
    const patient = dashboard.patients.find((item) => item.id === patientId);
    const patientRecords = dashboard.records.filter((item) => item.patientId === patientId);
    // Prefer real hardware clinical records when present; fall back to latest clinical trend.
    const record = [...patientRecords].reverse().find((item) => item.source === "HARDWARE")
      ?? patientRecords.at(-1);

    if (!patient || !record) {
      return NextResponse.json({
        error: "暂无可用于分析的临床膝角记录。请先上传置信度≥0.7 的双传感器样本，或使用已有临床趋势数据。",
      }, { status: 404 });
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
    where: { patientId, source: "HARDWARE" },
    orderBy: { recordedAt: "desc" },
  }) ?? await prisma.kneeDataRecord.findFirst({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
  });

  if (!patient || !record) {
    return NextResponse.json({
      error: "暂无可用于分析的临床膝角记录。请先上传置信度≥0.7 的双传感器样本。",
    }, { status: 404 });
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
