import { addDemoAiAnalysis } from "@/lib/demo-store";
import { hasUsableDatabaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  type AiAnalysisItem,
  type KneeDataPoint,
  type PatientSummary,
} from "@/lib/rehab";

export type AnalysisDraft = Pick<AiAnalysisItem, "provider" | "report" | "recommendation">;

const AUTO_ANALYSIS_COOLDOWN_MS = 30_000;
const recentAutoAnalysis = new Map<string, number>();

function localAnalysis(patient: PatientSummary, record: KneeDataPoint): AnalysisDraft {
  const risks = [
    record.flexionAngle < 78 ? `屈曲角度 ${record.flexionAngle.toFixed(0)}° 低于 78° 风险阈值` : null,
    record.activityFrequency < 6 ? `训练频次 ${record.activityFrequency} 次偏低` : null,
    record.activityDuration < 18 ? `训练时长 ${record.activityDuration} 分钟不足` : null,
    record.painScore >= 7 ? `疼痛评分 ${record.painScore} 分偏高` : null,
  ].filter(Boolean);

  const riskText = risks.length ? risks.join("；") : "当前关键指标未触发高危阈值";
  const sourceHint =
    record.source === "HARDWARE"
      ? "数据来源为真实硬件采集（HARDWARE）。"
      : record.source === "DEMO"
        ? "数据来源为演示/模拟（DEMO），仅供流程验证。"
        : `数据来源：${record.source}。`;

  return {
    provider: "local-rule",
    report: `${patient.name} 当前屈曲 ${record.flexionAngle.toFixed(0)}°，训练 ${record.activityFrequency} 次、累计 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。${riskText}。${sourceHint}`,
    recommendation:
      record.flexionAngle < 78 || record.painScore >= 7
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

function buildUserPrompt(patient: PatientSummary, record: KneeDataPoint) {
  return [
    `患者：${patient.name}，术后目标屈曲 ${patient.targetFlexion}°。`,
    `最新数据：屈曲 ${record.flexionAngle}°，伸直 ${record.extensionAngle}°，训练频次 ${record.activityFrequency} 次，训练时长 ${record.activityDuration} 分钟，疼痛 ${record.painScore}/10。`,
    `数据来源：${record.source}。`,
    "请生成关节康复分析和建议。若来源为 HARDWARE，请按真实采集数据处理；若来源为 DEMO，请明确标注为演示数据。",
  ].join("");
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
          content:
            "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士、患者和家属都能理解。建议必须体现先安抚、再评估、再干预，并说明家属如何安全陪伴。若输入标注 HARDWARE，按真实采集数据分析；若标注 DEMO，在报告中说明这是演示数据。",
        },
        {
          role: "user",
          content: buildUserPrompt(patient, record),
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
      system:
        "你是骨科 TKA 术后康复护士助手。只返回 JSON，字段为 report 和 recommendation，内容用中文，面向护士、患者和家属都能理解。建议必须体现先安抚、再评估、再干预，并说明家属如何安全陪伴。若输入标注 HARDWARE，按真实采集数据分析；若标注 DEMO，在报告中说明这是演示数据。",
      messages: [
        {
          role: "user",
          content: buildUserPrompt(patient, record),
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

export async function generateAnalysis(patient: PatientSummary, record: KneeDataPoint) {
  return (await callOpenAi(patient, record)) ?? (await callAnthropic(patient, record)) ?? localAnalysis(patient, record);
}

export function serializeAnalysis(analysis: {
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
  createdAt: Date | string;
}): AiAnalysisItem {
  return {
    ...analysis,
    createdAt: new Date(analysis.createdAt).toISOString(),
  };
}

function toPatientSummary(patient: {
  id: string;
  medicalRecordNo: string;
  name: string;
  age: number;
  roomNumber: string | null;
  surgeryDate: Date | string;
  surgicalSide: PatientSummary["surgicalSide"];
  targetFlexion: number;
  status: PatientSummary["status"];
  riskLevel: PatientSummary["riskLevel"];
}): PatientSummary {
  return {
    id: patient.id,
    medicalRecordNo: patient.medicalRecordNo,
    name: patient.name,
    age: patient.age,
    roomNumber: patient.roomNumber,
    surgeryDate: new Date(patient.surgeryDate).toISOString(),
    surgicalSide: patient.surgicalSide,
    targetFlexion: patient.targetFlexion,
    status: patient.status,
    riskLevel: patient.riskLevel,
  };
}

function toKneeDataPoint(record: {
  id: string;
  patientId: string;
  flexionAngle: number;
  extensionAngle: number;
  activityFrequency: number;
  activityDuration: number;
  painScore: number;
  batteryLevel: number;
  signalStrength: number;
  source: KneeDataPoint["source"];
  recordedAt: Date | string;
}): KneeDataPoint {
  return {
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
    recordedAt: new Date(record.recordedAt).toISOString(),
  };
}

export async function canAutoAnalyzePatient(patientId: string) {
  const lastMemory = recentAutoAnalysis.get(patientId) ?? 0;
  if (Date.now() - lastMemory < AUTO_ANALYSIS_COOLDOWN_MS) {
    return false;
  }

  if (!hasUsableDatabaseUrl()) {
    const { getDemoDashboardData } = await import("@/lib/demo-store");
    const latest = getDemoDashboardData().aiAnalyses.find((item) => item.patientId === patientId);
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < AUTO_ANALYSIS_COOLDOWN_MS) {
      return false;
    }
    return true;
  }

  const latest = await prisma.aiAnalysis.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (latest && Date.now() - latest.createdAt.getTime() < AUTO_ANALYSIS_COOLDOWN_MS) {
    return false;
  }

  return true;
}

export async function createAiAnalysisForPatient(patientId: string): Promise<AiAnalysisItem | null> {
  if (!hasUsableDatabaseUrl()) {
    const { getDemoDashboardData } = await import("@/lib/demo-store");
    const dashboard = getDemoDashboardData();
    const patient = dashboard.patients.find((item) => item.id === patientId);
    const record = dashboard.records.filter((item) => item.patientId === patientId).at(-1);

    if (!patient || !record) {
      return null;
    }

    const draft = await generateAnalysis(patient, record);
    const analysis = addDemoAiAnalysis({
      patientId: patient.id,
      patientName: patient.name,
      flexionAngle: record.flexionAngle,
      activityFrequency: record.activityFrequency,
      activityDuration: record.activityDuration,
      painScore: record.painScore,
      ...draft,
    });
    recentAutoAnalysis.set(patientId, Date.now());
    return analysis;
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  const record = await prisma.kneeDataRecord.findFirst({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
  });

  if (!patient || !record) {
    return null;
  }

  const draft = await generateAnalysis(toPatientSummary(patient), toKneeDataPoint(record));
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

  recentAutoAnalysis.set(patientId, Date.now());
  return serializeAnalysis(analysis);
}

export async function maybeAutoAnalyzeAfterSample(input: {
  patientId: string;
  hasKneeRecord: boolean;
}) {
  if (!input.hasKneeRecord) {
    return null;
  }

  if (!(await canAutoAnalyzePatient(input.patientId))) {
    return null;
  }

  try {
    return await createAiAnalysisForPatient(input.patientId);
  } catch {
    // Sample upload must not fail if the optional AI path errors.
    return null;
  }
}
