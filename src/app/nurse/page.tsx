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
  LogOut,
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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricEducationDialog, type MetricEducationKey } from "@/components/metric-education-dialog";
import { RoleSwitchButton } from "@/components/role-switch-button";
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
type NurseWorkspace = "overview" | "alerts" | "guidance" | "records" | "quality";
type GuidanceTemplateKey = "pain" | "lowActivity" | "familyAnxiety" | "homeSafety";
type SoapTemplateKey = "postOpPain" | "fallRisk" | "familyStress";

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
    title: "先稳住情绪",
    description: "预警出现后先确认疼痛、肿胀和紧张程度，再安排训练强度。",
  },
  {
    title: "指导写清停止条件",
    description: "家属需要知道何时暂停训练、何时冷敷抬高、何时联系护士。",
  },
  {
    title: "交接有据可查",
    description: "每次指导、电话随访、上门评估都保留记录，方便下一班继续处理。",
  },
];

const hospitalQualityModel = [
  {
    title: "1. 数据采集",
    description: "查看活动度、训练频次、训练时长和疼痛趋势，减少手工抄录。",
  },
  {
    title: "2. 风险优先级",
    description: "低角度、低频次、高疼痛患者优先进入随访和处置队列。",
  },
  {
    title: "3. 护理处置",
    description: "远程指导、康复调整、上门评估和 SOAP 记录统一留痕。",
  },
  {
    title: "4. 家属反馈",
    description: "处理结果同步到家属端，便于患者在家按同一计划执行。",
  },
];

const nurseQualityActions = [
  "晨间巡屏：先看高危预警和疼痛升高患者，确定当天优先随访对象。",
  "床旁或远程指导：填写今日训练目标、暂停条件和家属观察重点。",
  "交接班复盘：查看已处理、待随访、需上门的患者和护理记录。",
  "护理质量追踪：关注活动度、训练依从性、预警关闭率和家属反馈。",
];

const nurseWorkspaces: Array<{ value: NurseWorkspace; label: string; helper: string; icon: typeof Activity }> = [
  { value: "overview", label: "总览", helper: "患者与趋势", icon: Stethoscope },
  { value: "alerts", label: "预警", helper: "优先处置", icon: AlertTriangle },
  { value: "guidance", label: "指导", helper: "发起并记录", icon: Video },
  { value: "records", label: "记录", helper: "SOAP 记录", icon: FileText },
  { value: "quality", label: "路径", helper: "护理质量", icon: ClipboardCheck },
];

const guidanceTemplateOptions: Array<{ key: GuidanceTemplateKey; label: string; helper: string }> = [
  { key: "pain", label: "疼痛升高", helper: "先停强训练，复核疼痛和肿胀" },
  { key: "lowActivity", label: "活动不足", helper: "拆成短时多组，提高依从性" },
  { key: "familyAnxiety", label: "家属焦虑", helper: "先安抚，再解释数据含义" },
  { key: "homeSafety", label: "居家安全", helper: "防跌倒与夜间起身提醒" },
];

const soapTemplateOptions: Array<{ key: SoapTemplateKey; label: string; helper: string }> = [
  { key: "postOpPain", label: "术后疼痛 SOAP", helper: "疼痛、活动度、训练计划" },
  { key: "fallRisk", label: "跌倒风险 SOAP", helper: "步态、环境、扶行教育" },
  { key: "familyStress", label: "家属压力 SOAP", helper: "照护焦虑与沟通支持" },
];

const nursePanelClass = "rounded-xl border border-[var(--hairline)] bg-white text-[#12211c] shadow-e2";
const nurseQuietPanelClass = "rounded-md border border-[var(--hairline)] bg-[#fdfbf7]";
const nurseDarkPanelClass = "panel-ink grain rounded-xl border border-white/8 text-white shadow-e3 [&>*]:relative [&>*]:z-10";

function guidanceTemplateFor(key: GuidanceTemplateKey, patient: PatientSummary | null): Pick<GuidanceState, "guidance" | "notes"> {
  const name = patient?.name ?? "家人";

  if (key === "pain") {
    return {
      guidance: `${name}今天先暂停高强度屈膝训练，完成 1 组低强度踝泵和坐位轻柔屈伸即可。家属先确认疼痛位置、肿胀变化和护具佩戴，疼痛超过 6 分或持续加重时停止训练并联系护士。`,
      notes: "处置重点：先安抚，复核疼痛、肿胀、护具位置，再给出停止条件。",
    };
  }

  if (key === "lowActivity") {
    return {
      guidance: `${name}今天不追求一次练很多，改为每 2-3 小时 1 组，每组 5-8 分钟。家属负责提醒、陪数节奏和记录完成情况，出现明显疲劳或肿胀时减少一组。`,
      notes: "处置重点：缩短单次训练时间，增加少量多次陪练，记录完成情况。"
    };
  }

  if (key === "familyAnxiety") {
    return {
      guidance: `${name}的这条数据需要护士复核，但不代表恢复一定变差。家属今天先按原计划少量训练，重点观察疼痛、肿胀、睡眠和情绪变化；有担心可以继续记录给护士判断。`,
      notes: "处置重点：说明预警含义，交代观察重点，避免盲目加练或过度紧张。"
    };
  }

  return {
    guidance: `${name}夜间起身先开灯、坐稳 30 秒再站立，家属在患侧旁边保护；地面保持干燥，常用物品放在伸手可及处，今天避免急转、快走和无人陪伴上下楼。`,
    notes: "处置重点：防跌倒、夜间起身、动线整理和家属扶行位置。"
  };
}

function soapTemplateFor(key: SoapTemplateKey, patient: PatientSummary | null): SoapDraft {
  const name = patient?.name ?? "家人";

  if (key === "fallRisk") {
    return {
      actionType: "REHAB_ADJUSTMENT",
      diagnosis: "跌倒风险",
      guidance: `${name}今日重点预防跌倒：夜间起身先坐稳再站立，家属在旁保护，避免急转和无人陪伴上下楼。`,
      notes: "记录要点：跌倒风险评估、环境改造和扶行教育已完成。",
      subjective: "家属反馈夜间起身和步行时不放心，担心患者跌倒。",
      objective: "需结合步态稳定性、疼痛评分、膝关节活动度、居家动线和照明情况综合评估。",
      assessment: "患者存在术后步态代偿和夜间起身跌倒风险，需加强家庭环境安全和扶行指导。",
      plan: "完成防跌倒宣教，调整常用物品摆放，夜间预留照明，家属陪同起身和上下楼。",
      nextFollowUp: defaultExpectedTime(),
    };
  }

  if (key === "familyStress") {
    return {
      actionType: "PHONE_CALL",
      diagnosis: "家庭照护压力",
      guidance: `${name}的家属今天先不用追求训练量，重点记录疼痛、肿胀和最担心的问题。护士会根据记录一起调整计划。`,
      notes: "记录要点：家属照护压力已纳入护理评估，需电话随访确认理解程度。",
      subjective: "家属表达照护压力，担心训练不到位或训练过量影响恢复。",
      objective: "患者训练数据存在波动，家属对疼痛、肿胀和停止条件理解不充分。",
      assessment: "家庭照护压力影响康复执行一致性，需护士提供可执行的陪练和观察清单。",
      plan: "电话随访家属，明确今日训练目标、停止条件、异常上报方式和下一次复盘时间。",
      nextFollowUp: defaultExpectedTime(),
    };
  }

  return {
    actionType: "REMOTE_GUIDANCE",
    diagnosis: "术后疼痛",
    guidance: `${name}今日以低强度屈伸和踝泵为主，疼痛超过 6 分、肿胀明显或动作质量下降时暂停，家属记录变化后同步护士。`,
    notes: "记录要点：术后疼痛评估、训练强度调整和家属观察重点已同步。",
    subjective: "患者诉训练后膝部酸胀，疼痛可耐受，家属担心是否需要减少训练。",
    objective: "结合智能护膝屈曲角度、训练频次、训练时长、疼痛评分和肿胀反馈综合判断。",
    assessment: "术后疼痛与活动受限相关，当前需控制训练强度并继续观察疼痛和肿胀趋势。",
    plan: "维持短时多组训练，训练前后评估疼痛和肿胀；家属陪练时先问感受再协助动作。",
    nextFollowUp: defaultExpectedTime(),
  };
}

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
  const [activeWorkspace, setActiveWorkspace] = useState<NurseWorkspace>("overview");
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
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
      setAiState({ running: false, error: "智能评估生成失败，请稍后重试。" });
      return;
    }

    setAiState({ running: false, error: null });
  }

  function applyGuidanceTemplate(key: GuidanceTemplateKey) {
    setGuidance((current) => ({ ...current, ...guidanceTemplateFor(key, selectedPatient) }));
    setActiveWorkspace("guidance");
  }

  function applySoapTemplate(key: SoapTemplateKey) {
    const template = soapTemplateFor(key, selectedPatient);
    const label = soapTemplateOptions.find((item) => item.key === key)?.label ?? "SOAP 记录";
    setSoapDraft(template);
    setSoapMessage(`已生成${label}草稿，可继续编辑并保存。`);
    setActiveWorkspace("records");
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
    <main className="ambient relative min-h-screen bg-canvas pb-32 text-ink-900 md:pb-0">

      <section className="relative mx-auto flex max-w-[1500px] flex-col gap-3 px-3 py-3 md:gap-5 md:px-8 md:py-5">
        {/* ---------- 指挥台头部：标题 + 同步状态 + 动作组，一行收纳 ---------- */}
        <header className="family-view-enter flex flex-col gap-4 border-b border-[var(--hairline)] pb-5 md:pb-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="eyebrow text-brass-700">Nurse Console</p>
              <h1 className="display-md mt-2.5 flex flex-wrap items-baseline gap-x-3 text-[1.5rem] md:text-[1.75rem]">
                病区护理工作台
                <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-normal tracking-normal text-[var(--muted-foreground)]">
                  <span className={cn("sync-dot size-1.5 rounded-full", syncState === "realtime" ? "bg-[#2f7d5c]" : "bg-brass-500")} />
                  {syncState === "realtime" ? "实时数据在线" : syncState === "polling" ? "定时同步在线" : "正在连接数据"}
                </span>
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline" className="hidden h-9 rounded-lg px-3.5 lg:inline-flex">
                <Link href="/nurse/profile">护士资料</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hidden h-9 rounded-lg px-3.5 lg:inline-flex">
                <Link href="/appointments">护理预约</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 rounded-lg px-3">
                <Link href="/hardware-demo">
                  <Radio className="size-4" />
                  硬件
                </Link>
              </Button>
              <RoleSwitchButton role="family" size="sm" variant="outline" className="h-9 rounded-lg px-3">
                家属端
              </RoleSwitchButton>
              <Button size="sm" variant="outline" className="h-9 rounded-lg px-3" onClick={logout}>
                <LogOut className="size-4" />
                退出
              </Button>
              <Button size="sm" variant="brass" className="h-9 rounded-lg px-4" onClick={refreshDashboard}>
                <Radio className="size-4" />
                刷新
              </Button>
            </div>
          </div>
        </header>

        {/* ---------- 工作区切换：分段控件，滚动时贴顶 ---------- */}
        <nav className="family-view-enter sticky top-0 z-30 -mx-3 bg-[var(--canvas)]/92 px-3 py-2 backdrop-blur-md md:-mx-1 md:px-1">
          <div className="flex gap-1 overflow-x-auto rounded-full border border-[var(--hairline)] bg-white p-1 shadow-e1 md:inline-flex">
            {nurseWorkspaces.map((item) => {
              const Icon = item.icon;
              const active = activeWorkspace === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[0.8125rem] font-medium transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex-none md:px-4",
                    active
                      ? "bg-ink-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "text-[#576860] hover:bg-[#f0f6f2] hover:text-ink-900",
                  )}
                  onClick={() => setActiveWorkspace(item.value)}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-[#edd3a3]" : "text-[#497a62]")} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {activeWorkspace === "quality" ? (
          <div className="grid gap-5">
            <Card className={cn(nursePanelClass, "family-view-enter bg-[#fcf4e4]") }>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>院内标准护理路径</Badge>
                  <Badge className="bg-[#fbf1dd] text-[#6f4c1c]">病区培训 · 延续护理 · 质量追踪</Badge>
                </div>
                <CardTitle className="display-md text-xl md:text-2xl">护士如何提升护理质量</CardTitle>
                <p className="max-w-4xl text-sm leading-7 text-[#4d5c53] md:text-base">适用于病区巡查、出院随访和居家康复管理，帮助护理团队统一评估、处置、交接和复盘标准。</p>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="grid gap-3 md:grid-cols-4">
                  {hospitalQualityModel.map((item) => (
                    <div key={item.title} className="rounded-xl border border-[var(--hairline)] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="font-semibold text-[#12211c]">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[#576860]">{item.description}</p>
                    </div>
                  ))}
                </div>
                <div className={cn(nurseDarkPanelClass, "p-4")}>
                  <p className="font-semibold text-[#ddb474]">护士日常使用路径</p>
                  <div className="mt-3 grid gap-2">
                    {nurseQualityActions.map((item) => (
                      <p key={item} className="rounded-2xl bg-white/10 px-3 py-2 text-sm leading-6 text-[#c9d6ce]">{item}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
              {nursingCarePrinciples.map((item) => (
                <div key={item.title} className={cn(nursePanelClass, "p-5")}>
                  <p className="text-lg font-semibold text-[#12211c]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#576860]">{item.description}</p>
                </div>
              ))}
            </div>

            <Card className={nursePanelClass}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-3xl font-semibold tracking-[-0.03em]">
                  <ClipboardCheck className="size-7 text-[#497a62]" />
                  为当前患者生成记录
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className={cn(nurseQuietPanelClass, "p-4")}>
                  <p className="font-semibold text-[#12211c]">远程指导草稿</p>
                  <div className="mt-3 grid gap-2">
                    {guidanceTemplateOptions.map((item) => (
                      <button key={item.key} type="button" className="rounded-xl bg-ink-900 px-3 py-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-ink-800" onClick={() => applyGuidanceTemplate(item.key)}>
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-300">{item.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={cn(nurseQuietPanelClass, "p-4")}>
                  <p className="font-semibold text-[#12211c]">SOAP 记录草稿</p>
                  <div className="mt-3 grid gap-2">
                    {soapTemplateOptions.map((item) => (
                      <button key={item.key} type="button" className="rounded-xl bg-ink-900 px-3 py-3 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-ink-800" onClick={() => applySoapTemplate(item.key)}>
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-300">{item.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeWorkspace === "overview" ? (
          <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-5">
            <StatCard icon={UsersRound} metric="rom" label="监测患者" value={`${patients.length}`} helper="术后康复中" />
            <StatCard icon={Activity} metric="flexion" label="平均屈曲" value={`${averageFlexion.toFixed(0)}°`} helper="最新采集均值" />
            <StatCard icon={Stethoscope} metric="extension" label="平均伸直" value={`${averageExtension.toFixed(0)}°`} helper="越接近 0° 越理想" />
            <StatCard icon={Clock3} metric="duration" label="平均训练" value={`${averageDuration.toFixed(0)} 分`} helper="今日累计时长" />
            <StatCard icon={BellRing} metric="pain" label="高危预警" value={`${highAlerts.length}`} helper="需优先处理" danger={highAlerts.length > 0} />
          </div>
        ) : null}

        {activeWorkspace !== "quality" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className={nursePanelClass}>
            <CardHeader className="pb-2 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-lg md:gap-3 md:text-xl">
                <UsersRound className="size-5 text-emerald-300 md:size-6" />
                患者列表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3">
              {patients.map((patient) => {
                const latest = latestRecordFor(records, patient.id);
                const active = selectedPatient?.id === patient.id;
                const alert = alerts.find((item) => item.patientId === patient.id);

                return (
                  <div
                    key={patient.id}
                    className={cn(
                      "rounded-xl border p-3 transition-all md:rounded-xl md:p-4",
                      active ? "border-ink-900 bg-ink-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_6px_16px_-10px_rgba(20,35,30,0.7)]" : "border-[var(--hairline)] bg-white/72 text-[#12211c] hover:bg-white",
                      alert?.severity === "HIGH" || alert?.severity === "CRITICAL" ? "ring-2 ring-red-500/70" : "",
                    )}
                  >
                    <button className="w-full text-left" onClick={() => setSelectedPatientId(patient.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium md:text-lg">{patient.name}</p>
                          <p className={cn("mt-0.5 text-xs md:mt-1 md:text-sm", active ? "text-[#c9d6ce]" : "text-[#576860]")}>{patient.roomNumber ?? "居家随访"} · 术后第 {daysAfterSurgery(patient.surgeryDate)} 天</p>
                        </div>
                        <Badge variant={riskVariant(patient.riskLevel)}>{patient.riskLevel}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px] md:mt-4 md:gap-2 md:text-xs">
                        <span className={cn("rounded-xl px-2 py-1.5 md:rounded-2xl md:py-2", active ? "bg-white/10" : "bg-[#e2ede6] text-[#3c6552]")}>屈曲 {latest ? `${latest.flexionAngle.toFixed(0)}°` : "--"}</span>
                        <span className={cn("rounded-xl px-2 py-1.5 md:rounded-2xl md:py-2", active ? "bg-white/10" : "bg-[#e2ede6] text-[#3c6552]")}>频次 {latest?.activityFrequency ?? "--"}</span>
                        <span className={cn("rounded-xl px-2 py-1.5 md:rounded-2xl md:py-2", active ? "bg-white/10" : "bg-[#fbf1dd] text-[#6f4c1c]")}>疼痛 {latest?.painScore ?? "--"}</span>
                      </div>
                    </button>
                    {alert ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{alert.title}</p> : null}
                    <PatientDetailDialog patient={patient} records={records.filter((record) => record.patientId === patient.id)} alerts={allAlerts.filter((item) => item.patientId === patient.id)} nursingRecords={nursingRecords.filter((record) => record.patientId === patient.id)} aiAnalyses={aiAnalyses.filter((analysis) => analysis.patientId === patient.id)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {activeWorkspace === "overview" || activeWorkspace === "guidance" ? (
            <div className="min-w-0 space-y-5">
              {activeWorkspace === "overview" ? (
                <Card className={nursePanelClass}>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <Stethoscope className="size-7 text-emerald-700" />
                    {selectedPatient?.name ?? "选择患者"} · 膝关节实时趋势
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">屈曲角度、活动频次与训练时长自动随护膝数据更新，护士结合疼痛、睡眠和家属反馈判断护理重点。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedPatient ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/sensor-live?patientId=${encodeURIComponent(selectedPatient.id)}`}>
                        <Radio className="size-4" />查看实时原始帧
                      </Link>
                    </Button>
                  ) : null}
                  {selectedLatest ? (
                    <Badge variant={selectedLatest.flexionAngle < 78 || selectedLatest.painScore >= 7 ? "destructive" : "success"} className="px-3 py-1 text-sm">
                      最新 {formatTime(selectedLatest.recordedAt)}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <PatientMetric icon={Activity} metric="flexion" label="屈曲角度" value={selectedLatest ? `${selectedLatest.flexionAngle.toFixed(0)}°` : "--"} danger={(selectedLatest?.flexionAngle ?? 100) < 78} />
                  <PatientMetric icon={Stethoscope} metric="extension" label="伸直度" value={selectedLatest ? `${selectedLatest.extensionAngle.toFixed(0)}°` : "--"} danger={(selectedLatest?.extensionAngle ?? 0) > 8} />
                  <PatientMetric icon={HeartPulse} metric="frequency" label="活动频次" value={selectedLatest ? `${selectedLatest.activityFrequency} 次` : "--"} danger={(selectedLatest?.activityFrequency ?? 8) < 6} />
                  <PatientMetric icon={Clock3} metric="duration" label="训练时长" value={selectedLatest ? `${selectedLatest.activityDuration} 分` : "--"} danger={(selectedLatest?.activityDuration ?? 20) < 18} />
                </div>

                <div className="relative h-[280px] min-h-[280px] min-w-0 rounded-xl border border-slate-200 bg-slate-50 md:h-[340px] md:min-h-[340px]">
                  {chartReady ? (
                    <div className="absolute inset-2 md:inset-4">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={chartRows} margin={{ left: 4, right: 16, top: 18, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5dbc9" />
                          <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#576860" />
                          <YAxis stroke="#576860" />
                          <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid #e5dbc9" }} />
                          <Line type="monotone" dataKey="flexionAngle" name="屈曲角度" stroke="#2f6076" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </div>
              </CardContent>
                </Card>
              ) : null}

              {activeWorkspace === "overview" ? (
                <Card className={nursePanelClass}>
                  <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <Sparkles className="size-7 text-amber-600" />
                    智能关节评估
                  </CardTitle>
                  <p className="mt-2 text-sm text-[#576860]">读取当前患者最新膝关节数据，生成评估报告、护理重点和家属端指导内容。</p>
                </div>
                <Button size="lg" variant="elder" onClick={createAiAnalysis} disabled={!selectedPatient || !selectedLatest || aiState.running}>
                  <Sparkles className="size-5" />
                  {aiState.running ? "正在生成" : "生成智能评估"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiState.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{aiState.error}</p> : null}
                {selectedAnalyses.length === 0 ? (
                  <p className="rounded-2xl bg-[#fcf4e4] p-4 text-sm text-[#576860]">暂无智能评估。生成后可查看评估报告、护理重点和家属端指导内容。</p>
                ) : (
                  selectedAnalyses.slice(0, 2).map((analysis) => (
                    <div key={analysis.id} className="rounded-xl border border-amber-100 bg-amber-50/80 p-4">
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
              ) : null}

              {activeWorkspace === "guidance" ? (
                <Card className={nursePanelClass}>
                  <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Video className="size-7 text-sky-700" />
                  一键远程指导
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-4">
                  {guidanceTemplateOptions.map((item) => (
                    <button key={item.key} type="button" className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-left transition-all hover:border-sky-300 hover:bg-sky-100" onClick={() => applyGuidanceTemplate(item.key)}>
                      <span className="block text-sm font-semibold text-sky-950">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-sky-700">{item.helper}</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                  <div className="space-y-3">
                    <Textarea value={guidance.guidance} onChange={(event) => setGuidance((current) => ({ ...current, guidance: event.target.value }))} />
                    <Input value={guidance.notes} onChange={(event) => setGuidance((current) => ({ ...current, notes: event.target.value }))} placeholder="护理记录备注" />
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button size="lg" variant="elder" onClick={createGuidanceRecord} disabled={!selectedPatient || guidance.saving}>
                      <Video className="size-5" />
                      {guidance.saving ? "正在记录" : "发起指导并记录"}
                    </Button>
                    <p className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">提交后会形成护理记录，家属端可查看本次指导内容。</p>
                    <p className="rounded-2xl bg-brass-100 p-4 text-sm leading-6 text-brass-800">沟通顺序建议：先安抚担心，再解释数据，最后给出今天能完成的小目标。</p>
                  </div>
                </div>
              </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {activeWorkspace === "alerts" || activeWorkspace === "records" ? (
            <div className="min-w-0 space-y-5">
              {activeWorkspace === "alerts" ? (
                <Card className="rounded-2xl border border-red-200 bg-red-50 text-red-950 shadow-e4">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <AlertTriangle className="size-6 text-red-300" />
                  异常预警
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                    <CheckCircle2 className="mb-3 size-7" />
                    暂无开放预警，患者康复数据稳定。可继续关注家属已读情况和训练依从性。
                  </div>
                ) : (
                  alerts.slice(0, 6).map((alert) => {
                    const patient = patients.find((item) => item.id === alert.patientId);

                    return (
                      <div key={alert.id} className="rounded-xl border border-red-200 bg-white/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge variant="destructive" className="mb-3">{alert.severity}</Badge>
                            <p className="text-base font-medium">{alert.title}</p>
                            <p className="mt-1 text-sm text-red-800">{patient?.name ?? "未知患者"} · {alert.message}</p>
                          </div>
                          <AlertHandlingDialog alert={alert} patient={patient ?? null} onSubmit={handleAlertAction} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
                </Card>
              ) : null}

              {activeWorkspace === "records" ? (
                <Card className={nursePanelClass}>
                  <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <FileText className="size-6 text-[#497a62]" />
                    SOAP 护理记录
                  </CardTitle>
                  <Badge className="bg-[#e2ede6] text-[#3c6552]">最近记录在前</Badge>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white/72 p-2">
                  <Filter className="size-4 text-[#497a62]" />
                  <select className="w-full bg-transparent text-sm font-semibold text-[#12211c] outline-none" value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)}>
                    <option className="text-[#12211c]" value="ALL">全部记录</option>
                    <option className="text-[#12211c]" value="REMOTE_GUIDANCE">远程指导</option>
                    <option className="text-[#12211c]" value="REHAB_ADJUSTMENT">康复调整</option>
                    <option className="text-[#12211c]" value="HOME_VISIT">上门护理</option>
                    <option className="text-[#12211c]" value="PHONE_CALL">电话随访</option>
                    <option className="text-[#12211c]" value="MEDICATION_REMINDER">用药提醒</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-3">
                  {soapTemplateOptions.map((item) => (
                    <button key={item.key} type="button" className="rounded-2xl border border-[var(--hairline)] bg-white/72 px-3 py-3 text-left transition-all hover:bg-white" onClick={() => applySoapTemplate(item.key)}>
                      <span className="block text-sm font-semibold text-[#12211c]">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#576860]">{item.helper}</span>
                    </button>
                  ))}
                </div>
                <SoapRecordDialog selectedPatient={selectedPatient} draft={soapDraft} setDraft={setSoapDraft} saving={soapSaving} message={soapMessage} onSubmit={createSoapRecord} />
                {filteredNursingRecords.length === 0 ? (
                  <p className="rounded-2xl bg-white/70 p-4 text-[#576860]">暂无匹配护理记录。</p>
                ) : (
                  filteredNursingRecords.slice(0, 8).map((record) => <NursingRecordCard key={record.id} record={record} patients={patients} />)
                )}
              </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}
          </div>
        ) : null}
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
        <Button size="sm" variant="outline" className="mt-3 w-full border-[var(--hairline-strong)] bg-white/85 text-[#12211c] hover:bg-white hover:text-[#12211c]">
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
            <DetailList title="护理与评估" empty="暂无护理记录">
              {nursingRecords.slice(0, 3).map((record) => (
                <p key={record.id} className="rounded-2xl bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900">{actionTypeLabel(record.actionType)} · {record.guidance}</p>
              ))}
              {aiAnalyses.slice(0, 2).map((analysis) => (
                <p key={analysis.id} className="rounded-2xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">评估 · {analysis.recommendation}</p>
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
    <div className={cn("rounded-xl border p-4", danger ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-800")}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function DetailList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-e1">
      <p className="mb-3 text-sm font-semibold text-slate-700">{title}</p>
      <div className="grid gap-2">{hasItems ? children : <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-500">{empty}</p>}</div>
    </div>
  );
}

function StatCard({ icon: Icon, metric, label, value, helper, danger = false }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; helper: string; danger?: boolean }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className={cn("rounded-lg border p-3 text-left shadow-e1 transition-colors hover:bg-[#fdfbf7] md:p-4", danger ? "border-red-200 bg-red-50 text-red-800 ring-2 ring-red-200" : "border-[var(--hairline-strong)] bg-white text-[#12211c]")}>
        <div className={cn("flex items-center justify-between", danger ? "text-red-700" : "text-[#576860]")}>
          <span className="text-xs md:text-sm">{label}</span>
          <Icon className={cn("size-4 md:size-5", danger ? "text-red-600" : "text-[#497a62]")} />
        </div>
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight md:mt-4 md:text-4xl">{value}</p>
        <p className={cn("mt-1 text-xs md:mt-2 md:text-sm", danger ? "text-red-700" : "text-[#576860]")}>{helper} · 点击科普</p>
      </button>
    </MetricEducationDialog>
  );
}

function PatientMetric({ icon: Icon, metric, label, value, danger = false }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; danger?: boolean }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className={cn("rounded-lg border p-4 text-left transition-colors hover:border-[#a8c6b4] hover:bg-[#fdfbf7]", danger ? "border-red-200 bg-red-50 text-red-700" : "border-[var(--hairline-strong)] bg-white text-[#12211c]")}>
        <div className="flex items-center justify-between text-sm">
          <span>{label}</span>
          <Icon className="size-5" />
        </div>
        <p className="tabular mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{value}</p>
        <p className="mt-2 text-xs font-medium text-slate-500">点击查看正常范围</p>
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
          <DialogDescription>按 Subjective、Objective、Assessment、Plan 完整记录护理评估，便于交接班查看患者感受、客观数据、护理判断和照护计划。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              护理类型
              <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" value={draft.actionType} onChange={(event) => update("actionType", event.target.value)}>
                <option value="REMOTE_GUIDANCE">远程指导</option>
                <option value="REHAB_ADJUSTMENT">康复调整</option>
                <option value="HOME_VISIT">上门护理</option>
                <option value="PHONE_CALL">电话随访</option>
                <option value="MEDICATION_REMINDER">用药提醒</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              下次随访
              <Input type="datetime-local" value={draft.nextFollowUp} onChange={(event) => update("nextFollowUp", event.target.value)} />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            常见护理诊断
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" value={draft.diagnosis} onChange={(event) => update("diagnosis", event.target.value)}>
              {commonNursingDiagnoses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <span className="text-xs font-medium text-slate-500">保存后会把护理诊断写入 A 项，方便交接班继续查看。</span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            护理指导摘要
            <Textarea value={draft.guidance} onChange={(event) => update("guidance", event.target.value)} placeholder="写给家属端可直接阅读的指导摘要：先安抚，再说明做法和停止条件" />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <SoapField label="S 主观资料" value={draft.subjective} onChange={(value) => update("subjective", value)} />
            <SoapField label="O 客观资料" value={draft.objective} onChange={(value) => update("objective", value)} />
            <SoapField label="A 护理评估" value={draft.assessment} onChange={(value) => update("assessment", value)} />
            <SoapField label="P 护理计划" value={draft.plan} onChange={(value) => update("plan", value)} />
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
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
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <Textarea className="min-h-28" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AssessmentField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
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
    { value: "PERSONALIZED_ADVICE", label: "发送康复建议", helper: "写清今天做法和停止条件", icon: MessageSquareText },
    { value: "HOME_VISIT", label: "预约上门护理", helper: "现场评估并指导家庭照护", icon: Home },
    { value: "RESOLVE_ONLY", label: "填写处理记录", helper: "记录解释、安抚和关闭原因", icon: ClipboardCheck },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-[var(--hairline-strong)] bg-white/85 text-[#12211c] hover:bg-white hover:text-[#12211c]">
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
                  className={cn("rounded-xl border p-4 text-left transition-all", active ? "border-sky-500 bg-sky-50 text-sky-950 shadow-e3 shadow-sky-100" : "border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50")}
                  type="button"
                  onClick={() => selectAction(item.value)}
                >
                  <Icon className={cn("size-6", active ? "text-sky-700" : "text-slate-500")} />
                  <p className="mt-3 font-medium">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
                </button>
              );
            })}
          </section>

          <section className="grid gap-3">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">处理内容</p>
              <Textarea className="min-h-32" value={guidance} onChange={(event) => setGuidance(event.target.value)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">处理记录</p>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">结构化护理评估</p>
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
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <CalendarClock className="size-4" />
                  预约上门时间
                </p>
                <Input type="datetime-local" value={expectedTime} onChange={(event) => setExpectedTime(event.target.value)} />
              </div>
            ) : null}
          </section>

          {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm leading-6 text-slate-600">提交后会写入护理记录；如选择上门护理，会同步创建预约并关闭这条预警。</p>
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
      <div className="rounded-xl border border-[var(--hairline)] bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-[#12211c]">{patient?.name ?? "未知患者"}</p>
              <Badge className="bg-[#e2ede6] text-[#3c6552]">{actionTypeLabel(record.actionType)}</Badge>
              {record.soap ? <Badge className="bg-[#fbf1dd] text-[#6f4c1c]">SOAP</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-[#576860]">{record.nurseName} · {formatTime(record.createdAt)}</p>
          </div>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="border-[var(--hairline-strong)] bg-white/85 text-[#12211c] hover:bg-white hover:text-[#12211c]">
              <Eye className="size-4" />
              详情
            </Button>
          </DialogTrigger>
        </div>
        <Separator className="my-3 bg-[#e5dbc9]" />
        <p className="text-sm leading-6 text-[#4d5c53]">{record.guidance}</p>
        {record.notes ? <p className="mt-2 rounded-2xl bg-[#fcf4e4] px-3 py-2 text-xs leading-6 whitespace-pre-line text-[#576860]">{record.notes}</p> : null}
      </div>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <Badge className="w-fit bg-sky-600 text-white">{patient?.name ?? "未知患者"} · {actionTypeLabel(record.actionType)}</Badge>
          <DialogTitle>护理记录详情</DialogTitle>
          <DialogDescription>{record.nurseName} 于 {new Date(record.createdAt).toLocaleString("zh-CN")} 记录</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">家属端指导摘要</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-e1">
      <p className="text-sm font-semibold text-sky-700">{label}</p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value || "未填写"}</p>
    </div>
  );
}
