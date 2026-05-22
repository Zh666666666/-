"use client";

import Link from "next/link";
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  Filter,
  FileText,
  HeartPulse,
  Home,
  MessageSquareText,
  Radio,
  SendHorizontal,
  Sparkles,
  Stethoscope,
  UsersRound,
  Video,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricEducationDialog, type MetricEducationKey } from "@/components/metric-education-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import { daysAfterSurgery, formatTime, type AlertItem, type DashboardData, type KneeDataPoint, type NursingRecordItem, type NursingSoapFields, type PatientSummary } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SyncState = "connecting" | "realtime" | "polling";

type GuidanceState = {
  guidance: string;
  notes: string;
  saving: boolean;
};

type AiState = {
  running: boolean;
  error: string | null;
};

type AlertHandlingAction = "REMOTE_GUIDANCE" | "PERSONALIZED_ADVICE" | "HOME_VISIT" | "RESOLVE_ONLY";

type NursingAssessmentDraft = {
  subjective: string;
  objective: string;
  diagnosis: string;
  measures: string;
  evaluation: string;
};

type AlertHandlingPayload = {
  action: AlertHandlingAction;
  guidance: string;
  notes: string;
  expectedTime: string;
  assessment: NursingAssessmentDraft;
};

type SoapDraft = NursingSoapFields & {
  diagnosis: string;
  guidance: string;
  notes: string;
  actionType: string;
  nextFollowUp: string;
};

async function fetchDashboard() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Dashboard request failed");
  }

  return (await response.json()) as DashboardData;
}

function latestRecordFor(records: KneeDataPoint[], patientId: string) {
  return records.filter((record) => record.patientId === patientId).at(-1) ?? null;
}

function riskVariant(level: PatientSummary["riskLevel"]) {
  if (level === "HIGH") {
    return "destructive" as const;
  }

  if (level === "MEDIUM") {
    return "warning" as const;
  }

  return "success" as const;
}

function severityScore(severity: AlertItem["severity"]) {
  return severity === "CRITICAL" ? 4 : severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1;
}

function datetimeLocalValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function defaultExpectedTime() {
  return datetimeLocalValue(new Date(Date.now() + 24 * 60 * 60_000));
}

const commonNursingDiagnoses = [
  "术后疼痛",
  "关节活动受限",
  "肿胀风险",
  "跌倒风险",
  "康复焦虑",
  "睡眠受疼痛影响",
  "家庭照护压力",
  "自我照护不足",
  "家属照护配合需加强",
] as const;

const nursingCarePrinciples = [
  {
    title: "先安抚，再判断",
    description: "预警出现时先回应患者和家属的担心，再解释数据含义，避免让家属只看到风险。",
  },
  {
    title: "把家属纳入护理计划",
    description: "每条指导都写清楚家属能做什么、什么时候该停、什么情况需要再联系护士。",
  },
  {
    title: "尊严与安全同等重要",
    description: "提醒家属帮助前先询问、训练时不催促，用可执行的小目标维护患者信心。",
  },
];

const hospitalQualityModel = [
  {
    title: "1. 数据自动采集",
    description: "智能护膝持续上传活动度、频次、时长和疼痛趋势，减少护士手工抄录和漏记。",
  },
  {
    title: "2. 风险自动分层",
    description: "系统把低角度、低频次、高疼痛等风险前置，护士优先处理真正需要干预的人。",
  },
  {
    title: "3. 护理处置模板",
    description: "远程指导、个性化建议、上门护理、SOAP 记录按同一结构书写，新护士也能快速上手。",
  },
  {
    title: "4. 家属同步闭环",
    description: "护士处理后自动同步到家属端，让患者、家属、护士围绕同一份计划执行。",
  },
];

const nurseQualityActions = [
  "晨间巡屏：先看高危预警和疼痛升高患者，确定当天优先随访对象。",
  "床旁或远程指导：用模板快速生成家属能读懂的指导，减少口头交代遗漏。",
  "交接班复盘：按 SOAP 和预警处理记录查看已处理、待随访、需上门的患者。",
  "质控追踪：用活动度、训练依从性、预警关闭率和家属已读情况评估护理质量。",
];

function defaultAlertAssessment(action: AlertHandlingAction, alert: AlertItem, patient: PatientSummary | null): NursingAssessmentDraft {
  const name = patient?.name ?? "家人";

  if (action === "REMOTE_GUIDANCE") {
    return {
      subjective: `${name} 反馈 ${alert.title} 后有些担心，膝部酸胀，疼痛约 4 分，可耐受。家属希望确认是否还能继续训练。`,
      objective: "智能护膝在线，屈曲角度和训练频次可继续追踪，局部肿胀轻度，当前未见需立即停训的危险信号。",
      diagnosis: "术后疼痛与活动受限，伴康复焦虑，需要护士解释风险并指导家属陪练。",
      measures: "先安抚家属和患者，暂停高强度训练，指导低强度屈伸和踝泵练习，必要时冷敷抬高并复核护具佩戴。",
      evaluation: "本次远程指导后情绪较前稳定，家属明确观察重点，后续继续关注疼痛、肿胀与活动度变化。",
    };
  }

  if (action === "PERSONALIZED_ADVICE") {
    return {
      subjective: `${name} 当前适合短时多组训练，家属愿意协助记录变化，但担心训练过量会伤到膝盖。`,
      objective: "近 24 小时训练频次存在波动，疼痛评分和活动耐量需继续追踪。",
      diagnosis: "康复依从性波动，伴家庭照护压力，活动耐量有待逐步提升。",
      measures: "将训练拆分为 2-3 小时 1 组，每组 5-8 分钟；指导家属用鼓励代替催促，训练后观察疼痛和肿胀。",
      evaluation: "家属理解短时多组原则后，照护压力可下降；若按计划执行，可继续维持当前康复节奏并复查。",
    };
  }

  if (action === "HOME_VISIT") {
    return {
      subjective: `${name} 因 ${alert.title} 需要上门评估，家属表达担心并希望护士现场确认恢复情况。`,
      objective: "需现场复核关节肿胀、屈伸角度、步态代偿、居家动线及设备佩戴情况。",
      diagnosis: "存在上门评估需求，伴家属照护不确定感，术后恢复需护士现场复核。",
      measures: "安排上门护理，现场完成评估、指导、家庭环境安全检查，并示范家属如何陪练和扶行。",
      evaluation: "确认预约后继续跟进，家属明确上门前观察重点，必要时同步调整训练方案。",
    };
  }

  return {
    subjective: "预警已由家属和护士共同复核，家属已知晓当前无需过度紧张。",
    objective: "当前记录未见新增异常，相关指标已完成核对。",
    diagnosis: "当前风险已得到处理，继续常规随访并关注家属照护信心。",
    measures: "保持现有训练计划，向家属说明观察重点，若症状反复及时联系护理团队。",
    evaluation: "本次处置完成，家属理解后续观察方式，继续陪伴即可。",
  };
}

function formatAlertAssessment(assessment: NursingAssessmentDraft) {
  return [
    `S 主观资料：${assessment.subjective}`,
    `O 客观资料：${assessment.objective}`,
    `A 护理诊断：${assessment.diagnosis}`,
    `M 护理措施：${assessment.measures}`,
    `E 效果评价：${assessment.evaluation}`,
  ].join("\n");
}

function composeSoapAssessment(diagnosis: string, assessment: string) {
  return diagnosis ? `护理诊断：${diagnosis}\n${assessment}` : assessment;
}

function actionLabel(action: AlertHandlingAction) {
  if (action === "REMOTE_GUIDANCE") {
    return "立即远程指导";
  }

  if (action === "PERSONALIZED_ADVICE") {
    return "个性化康复建议";
  }

  if (action === "HOME_VISIT") {
    return "预约上门护理";
  }

  return "标记为已处理";
}

function defaultAlertGuidance(action: AlertHandlingAction, alert: AlertItem, patient: PatientSummary | null) {
  const name = patient?.name ?? "家人";

  if (action === "REMOTE_GUIDANCE") {
    return `${name}出现“${alert.title}”。建议立即进行视频/文字远程指导：先安抚家属和患者，说明这条预警代表需要复核而不是一定恶化；再暂停高强度训练，复核疼痛、肿胀和护膝佩戴位置，完成 1 组低强度坐位屈伸训练。`;
  }

  if (action === "PERSONALIZED_ADVICE") {
    return `${name}今日按短时多组方案训练：每 2-3 小时 1 组，每组 5-8 分钟；家属陪练时先问感受、再看动作，疼痛超过 6 分或膝部明显肿胀时停止训练并冷敷。`;
  }

  if (action === "HOME_VISIT") {
    return `${name}因“${alert.title}”需要上门护理评估，重点查看膝关节肿胀、屈伸角度、步态代偿、居家防跌倒环境和智能护膝佩戴情况，同时指导家属如何安全陪练。`;
  }

  return `已复核“${alert.title}”：${alert.message} 已完成护理处理并记录。已向家属说明当前观察重点，避免过度焦虑或盲目加练。`;
}

function defaultAlertNotes(action: AlertHandlingAction, alert: AlertItem) {
  if (action === "REMOTE_GUIDANCE") {
    return `预警来源：${alert.message} 已同步指导内容到家属端。`;
  }

  if (action === "PERSONALIZED_ADVICE") {
    return `预警来源：${alert.message} 已发送个性化康复建议。`;
  }

  if (action === "HOME_VISIT") {
    return `预警来源：${alert.message} 已创建上门护理预约并同步家属端。`;
  }

  return `预警来源：${alert.message} 已标记处理完成。`;
}

function actionTypeLabel(actionType: string) {
  const labels: Record<string, string> = {
    REMOTE_GUIDANCE: "远程指导",
    PHONE_CALL: "电话随访",
    HOME_VISIT: "上门护理",
    REHAB_ADJUSTMENT: "康复调整",
    MEDICATION_REMINDER: "用药提醒",
  };

  return labels[actionType] ?? actionType;
}

function emptySoapDraft(): SoapDraft {
  return {
    actionType: "REMOTE_GUIDANCE",
    diagnosis: "术后疼痛",
    guidance: "",
    notes: "",
    subjective: "家属反馈膝部酸胀，训练后疼痛可耐受，同时担心训练动作是否过量。",
    objective: "智能护膝数据已复核，观察屈曲角度、训练频次、疼痛评分、睡眠反馈和设备连接状态。",
    assessment: "TKA 术后康复进展需持续观察，当前以活动度恢复、疼痛控制、情绪安抚和家属配合为重点。",
    plan: "继续短时多组训练，家属陪练时先问感受再协助动作；异常疼痛或肿胀时暂停并联系护士。",
    nextFollowUp: "",
  };
}

export default function NursePage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [guidance, setGuidance] = useState<GuidanceState>({
    guidance: "今天先以坐位主动屈膝为主，每 2 小时 1 组，每组 8-10 次。家属陪练时先询问疼痛和紧张程度，疼痛明显时停止、冷敷并记录变化。",
    notes: "已远程安抚患者和家属，提醒家属协助观察步态、肿胀、疼痛和夜间起身安全。",
    saving: false,
  });
  const [aiState, setAiState] = useState<AiState>({ running: false, error: null });
  const [chartReady, setChartReady] = useState(false);
  const [recordFilter, setRecordFilter] = useState("ALL");
  const [soapDraft, setSoapDraft] = useState<SoapDraft>(() => emptySoapDraft());
  const [soapSaving, setSoapSaving] = useState(false);
  const [soapMessage, setSoapMessage] = useState<string | null>(null);

  async function refreshDashboard() {
    const nextDashboard = await fetchDashboard();
    setDashboard(nextDashboard);
    setSelectedPatientId((current) => current ?? nextDashboard.patients[0]?.id ?? null);
  }

  useEffect(() => {
    setChartReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await refreshDashboard();
      } catch {
        if (!cancelled) {
          setSyncState("polling");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSyncState("polling");
      const timer = window.setInterval(refreshDashboard, 3500);
      return () => window.clearInterval(timer);
    }

    setSyncState("realtime");
    const channel = subscribeToSharedTables("nurse-dashboard", refreshDashboard, undefined, (status) => {
      setSyncState(status === "SUBSCRIBED" ? "realtime" : "connecting");
    });
    const fallbackTimer = window.setInterval(refreshDashboard, 12000);

    return () => {
      window.clearInterval(fallbackTimer);
      removeRealtimeChannel(channel);
    };
  }, []);

  async function createGuidanceRecord() {
    if (!selectedPatientId || !guidance.guidance.trim()) {
      return;
    }

    setGuidance((current) => ({ ...current, saving: true }));

    try {
      const response = await fetch("/api/nursing-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatientId,
          nurseName: "刘护士",
          actionType: "REMOTE_GUIDANCE",
          guidance: guidance.guidance,
          notes: guidance.notes,
        }),
      });

      if (!response.ok) {
        throw new Error("Create nursing record failed");
      }

      await refreshDashboard();
    } finally {
      setGuidance((current) => ({ ...current, saving: false }));
    }
  }

  async function handleAlertAction(alert: AlertItem, patient: PatientSummary | null, payload: AlertHandlingPayload) {
    const assessmentNotes = formatAlertAssessment(payload.assessment);
    const nursingResponse = await fetch("/api/nursing-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: alert.patientId,
        nurseName: "刘护士",
        actionType: payload.action === "HOME_VISIT" ? "HOME_VISIT" : payload.action === "REMOTE_GUIDANCE" ? "REMOTE_GUIDANCE" : "REHAB_ADJUSTMENT",
        guidance: payload.guidance,
        notes: `【${actionLabel(payload.action)}】${payload.notes}\n\n结构化护理评估\n${assessmentNotes}`,
        nextFollowUp: payload.action === "HOME_VISIT" ? new Date(payload.expectedTime).toISOString() : null,
      }),
    });

    if (!nursingResponse.ok) {
      throw new Error("Create alert nursing record failed");
    }

    if (payload.action === "HOME_VISIT") {
      const appointmentResponse = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patient?.name ?? "未知患者",
          patientPhone: null,
          expectedTime: new Date(payload.expectedTime).toISOString(),
          description: `${payload.guidance}\n\n处理备注：${payload.notes}`,
        }),
      });

      if (!appointmentResponse.ok) {
        throw new Error("Create home visit appointment failed");
      }
    }

    const alertResponse = await fetch(`/api/alerts/${alert.id}`, { method: "PATCH" });

    if (!alertResponse.ok) {
      throw new Error("Resolve alert failed");
    }

    await refreshDashboard();
  }

  async function createSoapRecord() {
    if (!selectedPatientId || !soapDraft.guidance.trim()) {
      setSoapMessage("请选择患者并填写护理指导摘要。");
      return;
    }

    setSoapSaving(true);
    setSoapMessage(null);

    try {
      const response = await fetch("/api/nursing-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatientId,
          nurseName: "刘护士",
          actionType: soapDraft.actionType,
          guidance: soapDraft.guidance,
          notes: soapDraft.notes,
          soap: {
            subjective: soapDraft.subjective,
            objective: soapDraft.objective,
            assessment: composeSoapAssessment(soapDraft.diagnosis, soapDraft.assessment),
            plan: soapDraft.plan,
          },
          nextFollowUp: soapDraft.nextFollowUp ? new Date(soapDraft.nextFollowUp).toISOString() : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Create SOAP record failed");
      }

      setSoapDraft(emptySoapDraft());
      setSoapMessage("SOAP 护理记录已保存并同步。");
      await refreshDashboard();
    } catch {
      setSoapMessage("SOAP 护理记录保存失败，请稍后重试。");
    } finally {
      setSoapSaving(false);
    }
  }

  async function createAiAnalysis() {
    if (!selectedPatientId) {
      return;
    }

    setAiState({ running: true, error: null });

    try {
      const response = await fetch("/api/ai-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: selectedPatientId }),
      });

      if (!response.ok) {
        throw new Error("AI analysis request failed");
      }

      await refreshDashboard();
    } catch {
      setAiState({ running: false, error: "AI 分析生成失败，请稍后重试。" });
      return;
    }

    setAiState({ running: false, error: null });
  }

  const patients = dashboard?.patients ?? [];
  const records = dashboard?.records ?? [];
  const alerts = dashboard?.alerts.filter((alert) => alert.status !== "RESOLVED").sort((a, b) => severityScore(b.severity) - severityScore(a.severity)) ?? [];
  const allAlerts = dashboard?.alerts ?? [];
  const nursingRecords = dashboard?.nursingRecords ?? [];
  const filteredNursingRecords = recordFilter === "ALL" ? nursingRecords : nursingRecords.filter((record) => record.actionType === recordFilter);
  const aiAnalyses = dashboard?.aiAnalyses ?? [];
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0] ?? null;
  const selectedRecords = selectedPatient ? records.filter((record) => record.patientId === selectedPatient.id).slice(-24) : [];
  const selectedLatest = selectedPatient ? latestRecordFor(records, selectedPatient.id) : null;
  const selectedAnalyses = selectedPatient ? aiAnalyses.filter((analysis) => analysis.patientId === selectedPatient.id) : [];
  const highAlerts = alerts.filter((alert) => alert.severity === "HIGH" || alert.severity === "CRITICAL");
  const chartRows = selectedRecords.map((record) => ({
    time: formatTime(record.recordedAt),
    flexionAngle: record.flexionAngle,
    activityFrequency: record.activityFrequency,
    activityDuration: record.activityDuration,
    painScore: record.painScore,
  }));
  const latestByPatient = patients.map((patient) => latestRecordFor(records, patient.id)).filter(Boolean) as KneeDataPoint[];
  const averageFlexion = latestByPatient.length ? latestByPatient.reduce((sum, record) => sum + record.flexionAngle, 0) / latestByPatient.length : 0;
  const averageExtension = latestByPatient.length ? latestByPatient.reduce((sum, record) => sum + record.extensionAngle, 0) / latestByPatient.length : 0;
  const averageDuration = latestByPatient.length ? latestByPatient.reduce((sum, record) => sum + record.activityDuration, 0) / latestByPatient.length : 0;

  return (
    <main className="min-h-screen bg-slate-950 pb-40 text-white md:pb-0">
      <section className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-4 md:px-8 md:py-5">
        <header className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.25),transparent_34rem),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))] p-5 shadow-2xl shadow-black/20 md:rounded-[2rem] md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={syncState === "realtime" ? "success" : "warning"} className="gap-2 px-3 py-1 text-sm">
                  <span className={cn("sync-dot size-2 rounded-full", syncState === "realtime" ? "bg-emerald-500" : "bg-amber-500")} />
                  {syncState === "realtime" ? "Supabase Realtime 已连接" : syncState === "polling" ? "Demo 轮询模式" : "正在连接实时通道"}
                </Badge>
                <Badge className="bg-white/10 text-white">TKA 康复护士工作台</Badge>
              </div>
              <h1 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-6xl">实时护理质量工作台</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300 md:text-lg md:leading-8">集中查看术后患者膝关节角度、训练频次、训练时长与 AI 异常预警，并把评估、指导、家属沟通和质控追踪沉淀成一套可复制的护理闭环。</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button asChild size="lg" variant="outline" className="hidden border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white lg:inline-flex">
                <Link href="/nurse/profile">护士资料</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="hidden border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white lg:inline-flex">
                <Link href="/appointments">护理预约</Link>
              </Button>
              <Button size="lg" variant="elder" onClick={refreshDashboard}>
                <Radio className="size-5" />
                手动刷新
              </Button>
            </div>
          </div>
        </header>

        <Card className="border-white/10 bg-gradient-to-br from-white/[0.12] via-white/[0.06] to-emerald-500/10 text-white shadow-xl shadow-black/10">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-emerald-300 text-emerald-950">全国医院可复制模式</Badge>
              <Badge className="bg-white/10 text-white">打开即用 · 易培训 · 可质控</Badge>
            </div>
            <CardTitle className="text-2xl md:text-3xl">护士如何用这个工具提升护理质量</CardTitle>
            <p className="max-w-4xl text-sm leading-7 text-slate-300 md:text-base">把 TKA 术后护理从“个人经验驱动”变成“数据预警 + 标准处置 + 家属同步 + 质量复盘”的通用流程，各医院可直接套用到骨科康复护理小组、病区延续护理和居家随访场景。</p>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-3 md:grid-cols-4">
              {hospitalQualityModel.map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.08] p-4">
                  <p className="font-black text-emerald-100">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="font-black text-emerald-100">护士日常使用路径</p>
              <div className="mt-3 grid gap-2">
                {nurseQualityActions.map((item) => (
                  <p key={item} className="rounded-2xl bg-slate-950/45 px-3 py-2 text-sm leading-6 text-slate-200">{item}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          {nursingCarePrinciples.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-white shadow-xl shadow-black/10">
              <p className="text-lg font-black text-rose-100">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
          <StatCard icon={UsersRound} metric="rom" label="监测患者" value={`${patients.length}`} helper="术后康复中" />
          <StatCard icon={Activity} metric="flexion" label="平均屈曲" value={`${averageFlexion.toFixed(0)}°`} helper="最新采集均值" />
          <StatCard icon={Stethoscope} metric="extension" label="平均伸直" value={`${averageExtension.toFixed(0)}°`} helper="越接近 0° 越理想" />
          <StatCard icon={Clock3} metric="duration" label="平均训练" value={`${averageDuration.toFixed(0)} 分`} helper="今日累计时长" />
          <StatCard icon={BellRing} metric="pain" label="高危预警" value={`${highAlerts.length}`} helper="需优先处理" danger={highAlerts.length > 0} />
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
          <Card className="border-white/10 bg-white/[0.06] text-white shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <UsersRound className="size-6 text-emerald-300" />
                患者列表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {patients.map((patient) => {
                const latest = latestRecordFor(records, patient.id);
                const active = selectedPatient?.id === patient.id;
                const alert = alerts.find((item) => item.patientId === patient.id);

                return (
                  <div
                    key={patient.id}
                    className={cn(
                      "rounded-3xl border p-4 transition-all",
                      active ? "border-emerald-300 bg-emerald-300/15 shadow-lg shadow-emerald-950/20" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
                      alert?.severity === "HIGH" || alert?.severity === "CRITICAL" ? "ring-2 ring-red-500/70" : "",
                    )}
                  >
                    <button className="w-full text-left" onClick={() => setSelectedPatientId(patient.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold">{patient.name}</p>
                          <p className="mt-1 text-sm text-slate-400">{patient.roomNumber ?? "居家随访"} · 术后第 {daysAfterSurgery(patient.surgeryDate)} 天</p>
                        </div>
                        <Badge variant={riskVariant(patient.riskLevel)}>{patient.riskLevel}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                        <span className="rounded-2xl bg-white/10 px-2 py-2">屈曲 {latest ? `${latest.flexionAngle.toFixed(0)}°` : "--"}</span>
                        <span className="rounded-2xl bg-white/10 px-2 py-2">频次 {latest?.activityFrequency ?? "--"}</span>
                        <span className="rounded-2xl bg-white/10 px-2 py-2">疼痛 {latest?.painScore ?? "--"}</span>
                      </div>
                    </button>
                    {alert ? <p className="mt-3 rounded-2xl bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200">{alert.title}</p> : null}
                    <PatientDetailDialog patient={patient} records={records.filter((record) => record.patientId === patient.id)} alerts={allAlerts.filter((item) => item.patientId === patient.id)} nursingRecords={nursingRecords.filter((record) => record.patientId === patient.id)} aiAnalyses={aiAnalyses.filter((analysis) => analysis.patientId === patient.id)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-5">
            <Card className="border-white/10 bg-white text-slate-950 shadow-xl shadow-black/10">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <Stethoscope className="size-7 text-emerald-700" />
                    {selectedPatient?.name ?? "选择患者"} · 膝关节实时趋势
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">屈曲角度、活动频次与训练时长自动随护膝数据更新，护士结合疼痛、睡眠和家属反馈判断护理重点。</p>
                </div>
                {selectedLatest ? (
                  <Badge variant={selectedLatest.flexionAngle < 78 || selectedLatest.painScore >= 7 ? "destructive" : "success"} className="px-3 py-1 text-sm">
                    最新 {formatTime(selectedLatest.recordedAt)}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <PatientMetric icon={Activity} metric="flexion" label="屈曲角度" value={selectedLatest ? `${selectedLatest.flexionAngle.toFixed(0)}°` : "--"} danger={(selectedLatest?.flexionAngle ?? 100) < 78} />
                  <PatientMetric icon={Stethoscope} metric="extension" label="伸直度" value={selectedLatest ? `${selectedLatest.extensionAngle.toFixed(0)}°` : "--"} danger={(selectedLatest?.extensionAngle ?? 0) > 8} />
                  <PatientMetric icon={HeartPulse} metric="frequency" label="活动频次" value={selectedLatest ? `${selectedLatest.activityFrequency} 次` : "--"} danger={(selectedLatest?.activityFrequency ?? 8) < 6} />
                  <PatientMetric icon={Clock3} metric="duration" label="训练时长" value={selectedLatest ? `${selectedLatest.activityDuration} 分` : "--"} danger={(selectedLatest?.activityDuration ?? 20) < 18} />
                </div>

                <div className="h-[280px] min-h-[280px] min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-2 md:h-[340px] md:min-h-[340px] md:p-4">
                  {chartReady ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                      <LineChart data={chartRows} margin={{ left: 4, right: 16, top: 18, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid #dbe4ea" }} />
                        <Legend />
                        <Line type="monotone" dataKey="flexionAngle" name="屈曲角度" stroke="#0f766e" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="activityFrequency" name="活动频次" stroke="#2563eb" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="activityDuration" name="训练时长" stroke="#f97316" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white text-slate-950 shadow-xl shadow-black/10">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <Sparkles className="size-7 text-amber-600" />
                    AI 智能关节分析
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">读取当前患者最新膝关节数据，生成报告、护理重点和家属可理解的解释，辅助护士提高评估一致性。</p>
                </div>
                <Button size="lg" variant="elder" onClick={createAiAnalysis} disabled={!selectedPatient || !selectedLatest || aiState.running}>
                  <Sparkles className="size-5" />
                  {aiState.running ? "正在分析" : "AI智能分析"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiState.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{aiState.error}</p> : null}
                {selectedAnalyses.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">暂无 AI 分析。点击后会沉淀一份可追溯报告，帮助护士统一评估口径并推送给家属端。</p>
                ) : (
                  selectedAnalyses.slice(0, 2).map((analysis) => (
                    <div key={analysis.id} className="rounded-3xl border border-amber-100 bg-amber-50/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge className="bg-amber-600 text-white">{analysis.provider}</Badge>
                        <span className="text-xs text-slate-500">{formatTime(analysis.createdAt)}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{analysis.report}</p>
                      <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-semibold leading-6 text-amber-900">{analysis.recommendation}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white text-slate-950 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Video className="size-7 text-sky-700" />
                  一键远程指导
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_220px]">
                <div className="space-y-3">
                  <Textarea value={guidance.guidance} onChange={(event) => setGuidance((current) => ({ ...current, guidance: event.target.value }))} />
                  <Input value={guidance.notes} onChange={(event) => setGuidance((current) => ({ ...current, notes: event.target.value }))} placeholder="护理记录备注" />
                </div>
                <div className="flex flex-col gap-3">
                  <Button size="lg" variant="elder" onClick={createGuidanceRecord} disabled={!selectedPatient || guidance.saving}>
                    <Video className="size-5" />
                    {guidance.saving ? "正在记录" : "发起指导并记录"}
                  </Button>
                  <p className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">系统会把远程指导内容写入护理记录，并同步给家属端，便于交接班追踪和护理质量复盘。</p>
                  <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-900">沟通顺序建议：先安抚担心，再解释数据，最后给出今天能完成的小目标。</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-red-400/30 bg-red-950/45 text-white shadow-xl shadow-red-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <AlertTriangle className="size-6 text-red-300" />
                  AI 异常预警
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">
                    <CheckCircle2 className="mb-3 size-7" />
                    暂无开放预警，患者康复数据稳定。可继续关注家属已读情况和训练依从性。
                  </div>
                ) : (
                  alerts.slice(0, 6).map((alert) => {
                    const patient = patients.find((item) => item.id === alert.patientId);

                    return (
                      <div key={alert.id} className="rounded-3xl border border-red-300/20 bg-red-500/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge variant="destructive" className="mb-3">{alert.severity}</Badge>
                            <p className="text-base font-bold">{alert.title}</p>
                            <p className="mt-1 text-sm text-red-100">{patient?.name ?? "未知患者"} · {alert.message}</p>
                          </div>
                          <AlertHandlingDialog alert={alert} patient={patient ?? null} onSubmit={handleAlertAction} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.06] text-white shadow-xl shadow-black/10">
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <FileText className="size-6 text-sky-300" />
                    SOAP 护理记录
                  </CardTitle>
                  <Badge className="bg-sky-500/20 text-sky-100">倒序追踪</Badge>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2">
                  <Filter className="size-4 text-sky-200" />
                  <select className="w-full bg-transparent text-sm font-semibold text-white outline-none" value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)}>
                    <option className="text-slate-950" value="ALL">全部记录</option>
                    <option className="text-slate-950" value="REMOTE_GUIDANCE">远程指导</option>
                    <option className="text-slate-950" value="REHAB_ADJUSTMENT">康复调整</option>
                    <option className="text-slate-950" value="HOME_VISIT">上门护理</option>
                    <option className="text-slate-950" value="PHONE_CALL">电话随访</option>
                    <option className="text-slate-950" value="MEDICATION_REMINDER">用药提醒</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <SoapRecordDialog selectedPatient={selectedPatient} draft={soapDraft} setDraft={setSoapDraft} saving={soapSaving} message={soapMessage} onSubmit={createSoapRecord} />
                {filteredNursingRecords.length === 0 ? (
                  <p className="rounded-2xl bg-white/10 p-4 text-slate-300">暂无匹配护理记录。</p>
                ) : (
                  filteredNursingRecords.slice(0, 8).map((record) => <NursingRecordCard key={record.id} record={record} patients={patients} />)
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function PatientDetailDialog({ patient, records, alerts, nursingRecords, aiAnalyses }: { patient: PatientSummary; records: KneeDataPoint[]; alerts: AlertItem[]; nursingRecords: NursingRecordItem[]; aiAnalyses: DashboardData["aiAnalyses"] }) {
  const latest = records.at(-1) ?? null;
  const openAlerts = alerts.filter((alert) => alert.status !== "RESOLVED");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-3 w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <Eye className="size-4" />
          查看患者详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <Badge className="w-fit bg-sky-600 text-white">{patient.medicalRecordNo}</Badge>
          <DialogTitle>{patient.name} · 术后第 {daysAfterSurgery(patient.surgeryDate)} 天</DialogTitle>
          <DialogDescription>{patient.roomNumber ?? "居家随访"} · 目标屈曲 {patient.targetFlexion}° · 风险等级 {patient.riskLevel}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="grid gap-3 md:grid-cols-4">
            <DetailMetric label="最新屈曲" value={latest ? `${latest.flexionAngle.toFixed(0)}°` : "--"} danger={(latest?.flexionAngle ?? 100) < 78} />
            <DetailMetric label="训练频次" value={latest ? `${latest.activityFrequency} 次` : "--"} danger={(latest?.activityFrequency ?? 8) < 6} />
            <DetailMetric label="训练时长" value={latest ? `${latest.activityDuration} 分` : "--"} danger={(latest?.activityDuration ?? 20) < 18} />
            <DetailMetric label="开放预警" value={`${openAlerts.length}`} danger={openAlerts.length > 0} />
          </section>
          <section className="grid gap-4 lg:grid-cols-3">
            <DetailList title="最近采集" empty="暂无采集数据">
              {records.slice(-5).reverse().map((record) => (
                <p key={record.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{formatTime(record.recordedAt)} · 屈曲 {record.flexionAngle.toFixed(0)}° · 疼痛 {record.painScore}/10</p>
              ))}
            </DetailList>
            <DetailList title="预警历史" empty="暂无预警">
              {alerts.slice(0, 5).map((alert) => (
                <p key={alert.id} className={cn("rounded-2xl px-3 py-2 text-sm", alert.status === "RESOLVED" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{alert.status === "RESOLVED" ? "已处理" : "处理中"} · {alert.title}</p>
              ))}
            </DetailList>
            <DetailList title="护理与 AI" empty="暂无护理记录">
              {nursingRecords.slice(0, 3).map((record) => (
                <p key={record.id} className="rounded-2xl bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900">{actionTypeLabel(record.actionType)} · {record.guidance}</p>
              ))}
              {aiAnalyses.slice(0, 2).map((analysis) => (
                <p key={analysis.id} className="rounded-2xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">AI · {analysis.recommendation}</p>
              ))}
            </DetailList>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={cn("rounded-3xl border p-4", danger ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-800")}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function DetailList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-black text-slate-700">{title}</p>
      <div className="grid gap-2">{hasItems ? children : <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-500">{empty}</p>}</div>
    </div>
  );
}

function StatCard({ icon: Icon, metric, label, value, helper, danger = false }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; helper: string; danger?: boolean }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className={cn("rounded-3xl border border-white/10 p-5 text-left text-white shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-sky-300/60", danger ? "bg-red-500/20 ring-2 ring-red-500/60" : "bg-white/[0.06]")}>
        <div className="flex items-center justify-between text-slate-300">
          <span className="text-sm">{label}</span>
          <Icon className={cn("size-5", danger ? "text-red-300" : "text-sky-300")} />
        </div>
        <p className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{value}</p>
        <p className="mt-2 text-sm text-slate-400">{helper} · 点击科普</p>
      </button>
    </MetricEducationDialog>
  );
}

function PatientMetric({ icon: Icon, metric, label, value, danger = false }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; danger?: boolean }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className={cn("rounded-3xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg", danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-950")}>
        <div className="flex items-center justify-between text-sm">
          <span>{label}</span>
          <Icon className="size-5" />
        </div>
        <p className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{value}</p>
        <p className="mt-2 text-xs font-semibold text-slate-400">点击查看正常范围</p>
      </button>
    </MetricEducationDialog>
  );
}

function SoapRecordDialog({ selectedPatient, draft, setDraft, saving, message, onSubmit }: { selectedPatient: PatientSummary | null; draft: SoapDraft; setDraft: Dispatch<SetStateAction<SoapDraft>>; saving: boolean; message: string | null; onSubmit: () => Promise<void> }) {
  function update(key: keyof SoapDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" variant="outline" disabled={!selectedPatient}>
          <ClipboardCheck className="size-5" />
          新建 SOAP 护理记录
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <Badge className="w-fit bg-sky-600 text-white">{selectedPatient?.name ?? "未选择患者"}</Badge>
          <DialogTitle>结构化 SOAP 护理记录</DialogTitle>
          <DialogDescription>按 Subjective、Objective、Assessment、Plan 完整记录护理评估，把患者感受、客观数据、护理诊断、照护计划和家属沟通沉淀为可复制的质控记录。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              护理类型
              <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" value={draft.actionType} onChange={(event) => update("actionType", event.target.value)}>
                <option value="REMOTE_GUIDANCE">远程指导</option>
                <option value="REHAB_ADJUSTMENT">康复调整</option>
                <option value="HOME_VISIT">上门护理</option>
                <option value="PHONE_CALL">电话随访</option>
                <option value="MEDICATION_REMINDER">用药提醒</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              下次随访
              <Input type="datetime-local" value={draft.nextFollowUp} onChange={(event) => update("nextFollowUp", event.target.value)} />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            常见护理诊断
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" value={draft.diagnosis} onChange={(event) => update("diagnosis", event.target.value)}>
              {commonNursingDiagnoses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <span className="text-xs font-medium text-slate-500">A 项会自动带入护理诊断，便于不同医院、不同护士统一书写和质控抽查。</span>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            护理指导摘要
            <Textarea value={draft.guidance} onChange={(event) => update("guidance", event.target.value)} placeholder="写给家属端可直接阅读的指导摘要：先安抚，再说明做法和停止条件" />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <SoapField label="S 主观资料" value={draft.subjective} onChange={(value) => update("subjective", value)} />
            <SoapField label="O 客观资料" value={draft.objective} onChange={(value) => update("objective", value)} />
            <SoapField label="A 护理评估" value={draft.assessment} onChange={(value) => update("assessment", value)} />
            <SoapField label="P 护理计划" value={draft.plan} onChange={(value) => update("plan", value)} />
          </div>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            交接备注
            <Input value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="可选：交接班、家属沟通、照护压力或情绪观察备注" />
          </label>

          {message ? <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">{message}</p> : null}
          <Button size="lg" variant="elder" onClick={onSubmit} disabled={saving || !selectedPatient}>
            <FileText className="size-5" />
            {saving ? "正在保存" : "保存 SOAP 记录"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoapField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <Textarea className="min-h-28" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AssessmentField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <Textarea className="min-h-24" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function AlertHandlingDialog({ alert, patient, onSubmit }: { alert: AlertItem; patient: PatientSummary | null; onSubmit: (alert: AlertItem, patient: PatientSummary | null, payload: AlertHandlingPayload) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<AlertHandlingAction>("REMOTE_GUIDANCE");
  const [guidance, setGuidance] = useState(() => defaultAlertGuidance("REMOTE_GUIDANCE", alert, patient));
  const [notes, setNotes] = useState(() => defaultAlertNotes("REMOTE_GUIDANCE", alert));
  const [assessment, setAssessment] = useState(() => defaultAlertAssessment("REMOTE_GUIDANCE", alert, patient));
  const [expectedTime, setExpectedTime] = useState(defaultExpectedTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectAction(nextAction: AlertHandlingAction) {
    setAction(nextAction);
    setGuidance(defaultAlertGuidance(nextAction, alert, patient));
    setNotes(defaultAlertNotes(nextAction, alert));
    setAssessment(defaultAlertAssessment(nextAction, alert, patient));
    setExpectedTime(defaultExpectedTime());
    setError(null);
  }

  async function submit() {
    if (!guidance.trim() || !notes.trim()) {
      setError("请填写处理内容和处理记录。");
      return;
    }

    if (!Object.values(assessment).every((value) => value.trim().length > 0)) {
      setError("请完善结构化护理评估的五个项目。");
      return;
    }

    if (action === "HOME_VISIT" && !expectedTime) {
      setError("请选择上门护理预约时间。");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSubmit(alert, patient, { action, guidance, notes, expectedTime, assessment });
      setOpen(false);
    } catch {
      setError("处理失败，请检查网络或稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const actions: { value: AlertHandlingAction; label: string; helper: string; icon: typeof Video }[] = [
    { value: "REMOTE_GUIDANCE", label: "立即远程指导", helper: "先安抚再指导，生成护理记录", icon: Video },
    { value: "PERSONALIZED_ADVICE", label: "发送康复建议", helper: "把家属能执行的建议同步出去", icon: MessageSquareText },
    { value: "HOME_VISIT", label: "预约上门护理", helper: "现场评估并指导家庭照护", icon: Home },
    { value: "RESOLVE_ONLY", label: "填写处理记录", helper: "记录解释、安抚和关闭原因", icon: ClipboardCheck },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          处理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <Badge variant="destructive" className="w-fit">{alert.severity} 预警处理</Badge>
          <DialogTitle>{alert.title}</DialogTitle>
          <DialogDescription>{patient?.name ?? "未知患者"} · {alert.message}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-3 md:grid-cols-4">
            {actions.map((item) => {
              const Icon = item.icon;
              const active = action === item.value;

              return (
                <button
                  key={item.value}
                  className={cn("rounded-3xl border p-4 text-left transition-all", active ? "border-sky-500 bg-sky-50 text-sky-950 shadow-lg shadow-sky-100" : "border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50")}
                  type="button"
                  onClick={() => selectAction(item.value)}
                >
                  <Icon className={cn("size-6", active ? "text-sky-700" : "text-slate-500")} />
                  <p className="mt-3 font-bold">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
                </button>
              );
            })}
          </section>

          <section className="grid gap-3">
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">处理内容</p>
              <Textarea className="min-h-32" value={guidance} onChange={(event) => setGuidance(event.target.value)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">处理记录</p>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-700">结构化护理评估</p>
                <span className="text-xs font-semibold text-slate-500">S / O / A / M / E</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <AssessmentField label="S 主观资料" value={assessment.subjective} onChange={(value) => setAssessment((current) => ({ ...current, subjective: value }))} placeholder="家属反馈、疼痛感受、主观变化" />
                <AssessmentField label="O 客观资料" value={assessment.objective} onChange={(value) => setAssessment((current) => ({ ...current, objective: value }))} placeholder="体征、训练数据、设备状态" />
                <AssessmentField label="A 护理诊断" value={assessment.diagnosis} onChange={(value) => setAssessment((current) => ({ ...current, diagnosis: value }))} placeholder="如：术后疼痛、活动受限" />
                <AssessmentField label="M 护理措施" value={assessment.measures} onChange={(value) => setAssessment((current) => ({ ...current, measures: value }))} placeholder="本次指导、干预和护理措施" />
                <div className="md:col-span-2">
                  <AssessmentField label="E 效果评价" value={assessment.evaluation} onChange={(value) => setAssessment((current) => ({ ...current, evaluation: value }))} placeholder="本次处理后的反应、下一步观察重点" />
                </div>
              </div>
            </div>
            {action === "HOME_VISIT" ? (
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <CalendarClock className="size-4" />
                  预约上门时间
                </p>
                <Input type="datetime-local" value={expectedTime} onChange={(event) => setExpectedTime(event.target.value)} />
              </div>
            ) : null}
          </section>

          {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

          <div className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm leading-6 text-slate-600">提交后会写入护理记录，必要时创建预约，并自动把该预警标记为已处理；这条记录也可用于交接班和护理质量复盘。</p>
            <Button size="lg" variant="elder" onClick={submit} disabled={saving}>
              {saving ? <Clock3 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
              {saving ? "正在处理" : `提交：${actionLabel(action)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NursingRecordCard({ record, patients }: { record: NursingRecordItem; patients: PatientSummary[] }) {
  const patient = patients.find((item) => item.id === record.patientId);

  return (
    <Dialog>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold">{patient?.name ?? "未知患者"}</p>
              <Badge className="bg-white/10 text-white">{actionTypeLabel(record.actionType)}</Badge>
              {record.soap ? <Badge className="bg-sky-500/20 text-sky-100">SOAP</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-slate-400">{record.nurseName} · {formatTime(record.createdAt)}</p>
          </div>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Eye className="size-4" />
              详情
            </Button>
          </DialogTrigger>
        </div>
        <Separator className="my-3 bg-white/10" />
        <p className="text-sm leading-6 text-slate-200">{record.guidance}</p>
        {record.notes ? <p className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs leading-6 whitespace-pre-line text-slate-300">{record.notes}</p> : null}
      </div>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <Badge className="w-fit bg-sky-600 text-white">{patient?.name ?? "未知患者"} · {actionTypeLabel(record.actionType)}</Badge>
          <DialogTitle>护理记录详情</DialogTitle>
          <DialogDescription>{record.nurseName} 于 {new Date(record.createdAt).toLocaleString("zh-CN")} 记录</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-500">家属端指导摘要</p>
            <p className="mt-2 text-base leading-7 text-slate-800">{record.guidance}</p>
          </section>
          {record.soap ? (
            <section className="grid gap-3 md:grid-cols-2">
              <SoapDetail label="S 主观资料" value={record.soap.subjective} />
              <SoapDetail label="O 客观资料" value={record.soap.objective} />
              <SoapDetail label="A 护理评估" value={record.soap.assessment} />
              <SoapDetail label="P 护理计划" value={record.soap.plan} />
            </section>
          ) : null}
          {record.notes ? <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 whitespace-pre-line text-sky-900">交接备注：{record.notes}</p> : null}
          {record.nextFollowUp ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">下次随访：{new Date(record.nextFollowUp).toLocaleString("zh-CN")}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoapDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-sky-700">{label}</p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value || "未填写"}</p>
    </div>
  );
}
