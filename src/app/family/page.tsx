"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, BookOpenCheck, CalendarClock, CheckCircle2, ChevronRight, FileText, HeartHandshake, HeartPulse, Home, Radio, Smartphone, Sparkles, UserPlus } from "lucide-react";

import { MetricEducationDialog, type MetricEducationKey } from "@/components/metric-education-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import { createDemoRecord, formatTime, type AiAnalysisItem, type AlertItem, type DashboardData, type KneeDataPoint, type NursingRecordItem, type PatientSummary, type SensorSampleItem } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "syncing" | "synced" | "error";
type FamilyWorkspace = "today" | "data" | "nurse" | "care";
type SensorLiveSummary = {
  latest: SensorSampleItem | null;
  latestByPlacement: Partial<Record<"THIGH" | "SHANK", SensorSampleItem | null>>;
  sampleCount: number;
  dualActive: boolean;
};
const isClientDemoMode = process.env.NEXT_PUBLIC_APP_MODE === "demo";

async function fetchDashboard() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Dashboard request failed");
  }

  return (await response.json()) as DashboardData;
}

const familyWorkspaces: Array<{ value: FamilyWorkspace; label: string; helper: string; icon: typeof Activity }> = [
  { value: "today", label: "今日陪伴", helper: "先做最重要的事", icon: HeartHandshake },
  { value: "data", label: "数据趋势", helper: "护膝与训练记录", icon: Activity },
  { value: "nurse", label: "护士建议", helper: "分析、预警、指导", icon: FileText },
  { value: "care", label: "照护工具", helper: "预约、资料、学习", icon: Home },
];

const carePromiseCards = [
  {
    title: "先看见人，再看见数值",
    description: "角度、频次和疼痛分只是提醒，护士会同时关注家人的表情、睡眠、害怕和坚持。",
  },
  {
    title: "让家属知道怎么做",
    description: "指导内容会写清楚今天做什么、做到什么程度、什么情况需要暂停并联系护士。",
  },
  {
    title: "不让家属独自扛着",
    description: "异常预警、上门护理和远程指导会形成闭环，家属不是旁观者，而是被支持的照护伙伴。",
  },
];

const companionPlan = ["先问一句疼不疼、累不累", "训练前确认地面防滑和护具位置", "训练后看肿胀、补水、夸一句今天的坚持"];

const careToolCards = [
  {
    title: "预约上门护理",
    description: "疼痛、肿胀、陪练拿不准时，把担心直接交给护士判断。",
    href: "/appointments",
    icon: CalendarClock,
  },
  {
    title: "指导建议记录",
    description: "查看护士已同步的远程指导，方便家属照着做、照着说。",
    href: "/family/guidance",
    icon: FileText,
  },
  {
    title: "设备绑定",
    description: "确认智能护膝连接状态，避免家属误以为数据丢失。",
    href: "/family/devices",
    icon: Smartphone,
  },
  {
    title: "中医康复知识",
    description: "学习按摩、热敷、情志调护和居家安全的温和照护方法。",
    href: "/family/tcm-knowledge",
    icon: BookOpenCheck,
  },
];

const panelClass = "rounded-xl border border-[var(--hairline)] bg-white text-[#12211c] shadow-e2";
const quietPanelClass = "rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)]";
const darkPanelClass = "panel-ink grain rounded-xl border border-white/8 text-white shadow-e3 [&>*]:relative [&>*]:z-10";

export default function FamilyPage() {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [latestRecord, setLatestRecord] = useState<KneeDataPoint | null>(null);
  const [recentRecords, setRecentRecords] = useState<KneeDataPoint[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysisItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [nursingRecords, setNursingRecords] = useState<NursingRecordItem[]>([]);
  const [sensorLive, setSensorLive] = useState<SensorLiveSummary | null>(null);
  const [sensorNow, setSensorNow] = useState(() => Date.now());
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [dailyCheckIn, setDailyCheckIn] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<FamilyWorkspace>("today");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const dashboard = await fetchDashboard();
        const firstPatient = dashboard.patients[0];

        if (cancelled) {
          return;
        }

        if (!firstPatient) {
          setNeedsSetup(true);
          return;
        }

        setNeedsSetup(false);
        setPatient(firstPatient);
        setRecentRecords(dashboard.records.filter((record) => record.patientId === firstPatient.id).slice(-5).reverse());
        setAiAnalyses(dashboard.aiAnalyses.filter((analysis) => analysis.patientId === firstPatient.id));
        setAlerts(dashboard.alerts.filter((alert) => alert.patientId === firstPatient.id));
        setNursingRecords(dashboard.nursingRecords.filter((record) => record.patientId === firstPatient.id));
      } catch {
        if (!cancelled) {
          setError("无法读取患者信息，请确认服务已启动。 ");
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patient) {
      return;
    }

    const patientId = patient.id;

    async function refreshSharedData() {
      const dashboard = await fetchDashboard();
      const currentPatient = dashboard.patients.find((item) => item.id === patientId) ?? dashboard.patients[0] ?? null;

      if (currentPatient) {
        setPatient(currentPatient);
        setRecentRecords(dashboard.records.filter((record) => record.patientId === currentPatient.id).slice(-5).reverse());
        setAiAnalyses(dashboard.aiAnalyses.filter((analysis) => analysis.patientId === currentPatient.id));
        setAlerts(dashboard.alerts.filter((alert) => alert.patientId === currentPatient.id));
        setNursingRecords(dashboard.nursingRecords.filter((record) => record.patientId === currentPatient.id));
      }
    }

    if (!supabase) {
      const timer = window.setInterval(refreshSharedData, 3500);
      return () => window.clearInterval(timer);
    }

    const channel = subscribeToSharedTables("family-shared-data", refreshSharedData);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [patient]);

  useEffect(() => {
    if (!patient) return;

    const patientId = patient.id;
    let eventSource: EventSource | null = null;

    async function refreshSensorLive() {
      const response = await fetch(`/api/sensor-samples?patientId=${encodeURIComponent(patientId)}&limit=20`, { cache: "no-store" });
      if (!response.ok) return;
      setSensorLive((await response.json()) as SensorLiveSummary);
      setSensorNow(Date.now());
    }

    void refreshSensorLive();
    eventSource = new EventSource(`/api/sensor-samples/stream?patientId=${encodeURIComponent(patientId)}`);
    eventSource.addEventListener("sample", () => void refreshSensorLive());
    const pollTimer = window.setInterval(() => void refreshSensorLive(), 1000);
    const clockTimer = window.setInterval(() => setSensorNow(Date.now()), 500);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
      eventSource?.close();
    };
  }, [patient]);

  useEffect(() => {
    if (!patient || !isClientDemoMode) {
      return;
    }

    let stopped = false;
    const patientId = patient.id;

    async function upload() {
      const record = createDemoRecord(patientId);
      setUploadState("syncing");
      setError(null);

      try {
        const response = await fetch("/api/knee-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const payload = (await response.json()) as { record: KneeDataPoint };

        if (!stopped) {
          setLatestRecord(payload.record);
          setRecentRecords((current) => [payload.record, ...current].slice(0, 5));
          setUploadState("synced");
        }
      } catch {
        if (!stopped) {
          setUploadState("error");
          setError("本次自动同步失败，系统将在下一轮重试。 ");
        }
      }
    }

    upload();
    const timer = window.setInterval(upload, 5000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [patient]);

  const latestHardwareSample = sensorLive?.latest ?? null;
  const hardwareFrameAge = latestHardwareSample ? Math.max(0, sensorNow - new Date(latestHardwareSample.recordedAt).getTime()) : null;
  const hardwareOnline = latestHardwareSample?.source === "HARDWARE" && hardwareFrameAge !== null && hardwareFrameAge <= 2_500;
  const stateLabel = hardwareOnline
    ? `实时同步 ${(hardwareFrameAge! / 1000).toFixed(1)}s`
    : latestHardwareSample?.source === "HARDWARE"
      ? "硬件数据已延迟"
      : uploadState === "syncing"
        ? "演示同步中"
        : uploadState === "error"
          ? "等待重试"
          : "等待 App 实时上传";
  const fallbackRecord = latestRecord ?? recentRecords[0] ?? null;
  const flexion = latestHardwareSample?.flexionAngle ?? fallbackRecord?.flexionAngle ?? null;
  const measurementAt = latestHardwareSample?.recordedAt ?? fallbackRecord?.recordedAt ?? null;
  const flexionLabel = hardwareOnline ? "当前膝盖弯曲角度" : flexion === null ? "等待首次测量" : "上次测量的弯曲角度";
  const flexionDisplay = flexion === null ? "--" : `${flexion.toFixed(0)}°`;
  const frequency = latestRecord?.activityFrequency ?? recentRecords[0]?.activityFrequency ?? 0;
  const extension = latestRecord?.extensionAngle ?? recentRecords[0]?.extensionAngle ?? 0;
  const duration = latestRecord?.activityDuration ?? recentRecords[0]?.activityDuration ?? 0;
  const battery = latestRecord?.batteryLevel ?? recentRecords.find((record) => record.batteryLevel !== null)?.batteryLevel ?? null;
  const latestAnalysis = aiAnalyses[0] ?? null;
  const latestAlert = alerts[0] ?? null;
  const latestGuidance = nursingRecords[0] ?? null;
  const honorific = (patient?.age ?? 0) >= 70 ? "爷爷/奶奶" : "家人";
  const encouragement = latestRecord
    ? `今天${honorific}又完成了一次努力。角度在变好很重要，愿意坚持、愿意被陪伴也同样重要。`
    : "先不用着急追赶数字，我们会陪着您把每一次疼痛、害怕、进步和坚持都认真记录下来。";
  const hasOpenAlert = Boolean(latestAlert && latestAlert.status !== "RESOLVED");
  const nextCareStep = hasOpenAlert
    ? "先暂停让家人明显不舒服的动作，记录疼痛和肿胀变化，必要时预约护士上门评估。"
    : latestGuidance
      ? "今天优先按护士建议执行，训练前先问感受，训练后把疼痛、肿胀和睡眠变化记下来。"
      : "先完成今日陪伴打卡，再查看最新角度和训练时长；如有疼痛、肿胀或不放心，及时预约护士。";

  return (
    <main className="ambient app-workspace relative min-h-screen bg-canvas px-3 pb-28 pt-3 text-ink-900 md:px-10 md:pb-10 md:pt-6">

      <section className="relative mx-auto flex max-w-6xl flex-col gap-3 md:gap-5">
        {/* ---------- 指挥台头部：一行读数据，两个动作，不再占半屏 ---------- */}
        <header className="console-header dashboard-heading family-view-enter flex flex-col gap-4 border-b border-[var(--hairline)] pb-5 md:pb-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="eyebrow text-brass-700 tracking-[0.14em]">Family Console</p>
              <h1 className="display-md mt-2.5 flex flex-wrap items-baseline gap-x-3 text-[1.625rem] md:text-[2rem]">
                {patient ? patient.name : "家庭照护台"}
                <span className="text-[0.875rem] font-normal tracking-normal text-[var(--muted-foreground)]">
                  {patient ? `${patient.age} 岁 · TKA 术后康复` : "正在读取家人信息"}
                </span>
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline-strong)] bg-white px-3 py-1.5 text-[0.75rem] font-medium text-[#4d5c53] shadow-e1">
                <span className={`sync-dot size-1.5 rounded-full ${hardwareOnline ? "bg-[#2f7d5c]" : "bg-brass-500"}`} />
                {hardwareOnline ? "双传感器实时在线" : "等待真实硬件数据"}
              </span>
              <Button asChild size="sm" variant="brass" className="h-9 rounded-lg px-4">
                <Link href="/appointments">预约护理</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 rounded-lg px-4">
                <Link href="/family/profile">个人资料</Link>
              </Button>
            </div>
          </div>

          {/* 关键读数条：屈曲角 · 阶段目标 · 同步状态，扫一眼即得 */}
          <div className="metric-strip family-metrics grid grid-cols-3 gap-3 rounded-2xl">
            <div className="metric-cell px-3 py-4 md:px-5 md:py-5">
              <p className="text-[0.6875rem] font-medium tracking-[0.04em] text-[var(--subtle-foreground)]">{flexionLabel}</p>
              <p className="tabular mt-1.5 text-[1.625rem] font-semibold leading-none tracking-normal text-[#3c6552] md:text-[2rem]">{flexionDisplay}</p>
              {!hardwareOnline && measurementAt ? (
                <p className="mt-1.5 truncate text-[0.6875rem] text-[var(--subtle-foreground)]">测于 {formatTime(measurementAt)}</p>
              ) : null}
            </div>
            <div className="metric-cell px-3 py-4 md:px-5 md:py-5">
              <p className="text-[0.6875rem] font-medium tracking-[0.04em] text-[var(--subtle-foreground)]">阶段目标（因人而异）</p>
              <p className="tabular mt-1.5 text-[1.625rem] font-semibold leading-none tracking-normal md:text-[2rem]">{patient?.targetFlexion ?? 110}°</p>
            </div>
            <div className="metric-cell px-3 py-4 md:px-5 md:py-5">
              <p className="text-[0.6875rem] font-medium tracking-[0.04em] text-[var(--subtle-foreground)]">数据状态</p>
              <p className="mt-1.5 break-words text-[0.9375rem] font-semibold leading-none md:mt-2.5 md:text-[1.0625rem]">{stateLabel}</p>
            </div>
          </div>
        </header>

        {needsSetup ? (
          <section className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-e2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-amber-900"><UserPlus className="size-5" />还差一步即可开始使用</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">创建家人的康复档案，或输入护士提供的一次性关联码。系统不会自动关联陌生患者。</p>
            </div>
            <Button asChild className="shrink-0"><Link href="/family/profile?setup=1">建立康复档案<ChevronRight className="size-4" /></Link></Button>
          </section>
        ) : null}

        {/* ---------- 工作区切换：分段控件，轻量贴顶 ---------- */}
        <nav className="family-view-enter sticky top-0 z-30 -mx-3 bg-[var(--canvas)]/92 px-3 py-2 backdrop-blur-md md:-mx-1 md:px-1">
          <div className="workspace-tabs flex gap-1 overflow-x-auto rounded-xl border border-[var(--hairline)] bg-white/95 p-1.5 shadow-e1 md:inline-flex">
            {familyWorkspaces.map((item) => {
              const Icon = item.icon;
              const active = activeWorkspace === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-[0.8125rem] font-medium transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex-none md:px-4",
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

        {activeWorkspace === "today" ? (
          <div className="family-view-enter grid items-start gap-5 xl:grid-cols-[1.35fr_0.85fr]">
            <Card className={cn(panelClass, "care-rhythm overflow-hidden") }>
              <CardHeader className="pb-1 md:pb-2">
                <p className="section-kicker">今天先做这些</p>
                <CardTitle className="display-md mt-1 text-xl md:mt-2 md:text-2xl">今日照护节奏</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-1 md:space-y-5 md:p-6 md:pt-2">
                <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                  <div className={cn(darkPanelClass, "p-4 md:p-5") }>
                    <div className="flex items-center justify-between text-sm text-[#b6c6bc]">
                      <span>同步状态</span>
                      <Radio className="size-5 text-[#ddb474]" />
                    </div>
                    <div className="mt-5 flex items-center gap-3 md:mt-8 md:gap-4">
                      <span className={`sync-dot size-5 rounded-full shadow-e3 ${hardwareOnline ? "bg-emerald-300 shadow-emerald-300/50" : "bg-amber-300 shadow-amber-300/40"}`} />
                      <p className="text-2xl font-semibold tracking-tight md:text-3xl">{stateLabel}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#b6c6bc] md:mt-4 md:text-base md:leading-7">{patient ? `${patient.name}，${patient.roomNumber ?? "居家康复"}` : "正在读取家人信息"}</p>
                  </div>

                  <MetricEducationDialog metric="flexion">
                    <button className={cn(quietPanelClass, "interactive-surface group p-4 text-left hover:bg-white md:p-6") }>
                      <div className="flex items-center justify-between text-sm text-[#576860]">
                        <span>今天最关键指标</span>
                        <Activity className="size-5 text-[#497a62]" />
                      </div>
                      <p className="tabular mt-3 text-5xl font-semibold tracking-normal text-[#3c6552] md:mt-5 md:text-6xl">{flexionDisplay}</p>
                      <p className="mt-3 text-base leading-7 text-[#576860]">目标角度 {patient?.targetFlexion ?? 110}°，点击查看康复科普。</p>
                    </button>
                  </MetricEducationDialog>
                </div>

                <div className={cn(quietPanelClass, "p-5") }>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="section-kicker">陪伴小提醒</p>
                      <p className="mt-3 max-w-2xl text-base leading-7 text-[#4d5c53]">{encouragement}</p>
                    </div>
                    <Button size="lg" className="h-10 rounded-lg text-sm md:h-12 md:text-base" onClick={() => setDailyCheckIn(true)} disabled={dailyCheckIn}>
                      <CheckCircle2 className="size-5" />
                      {dailyCheckIn ? "今日已陪伴" : "完成陪伴"}
                    </Button>
                  </div>
                  <div className="care-timeline mt-4 grid gap-0 md:mt-5">
                    {companionPlan.map((item, index) => (
                      <p key={item} className="flex items-center gap-3 py-3 text-sm leading-6 text-ink-700">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-sage-300 bg-white text-xs font-semibold text-sage-700">{index + 1}</span>{item}
                      </p>
                    ))}
                  </div>
                  {dailyCheckIn ? (
                    <div className="panel-ink grain relative mt-5 overflow-hidden rounded-xl border border-white/8 px-4 py-4 text-white">
                      <div className="flex items-center gap-3">
                        <Sparkles className="size-6 animate-bounce text-[#ddb474]" />
                        <p className="font-medium">打卡完成，今天已经为康复迈出稳稳的一步。</p>
                      </div>
                      <p className="mt-2 leading-7 text-[#c9d6ce]">您今天做的不只是点一次打卡，而是在告诉家人：恢复慢一点也没关系，我们一起把这段路走稳。</p>
                    </div>
                  ) : null}
                </div>

                {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700">{error}</p> : null}
              </CardContent>
            </Card>

            <Card className={cn(panelClass, "care-next-step bg-sand-50") }>
              <CardHeader>
                <p className="section-kicker">家属行动提示</p>
                <CardTitle className="display-md mt-2 text-xl md:text-2xl">下一步提醒</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="rounded-lg bg-white/70 p-4 text-base font-semibold leading-7 text-[#12211c] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] md:rounded-xl md:p-5 md:text-xl md:leading-9">{nextCareStep}</p>
                <div className="grid gap-3">
                  <button type="button" onClick={() => setActiveWorkspace("nurse")} className="interactive-surface group flex items-center justify-between rounded-lg border border-[var(--hairline)] bg-white/70 p-3 text-left hover:bg-white md:rounded-xl md:p-4">
                    <span>
                      <span className="block font-semibold text-[#12211c]">看护士建议</span>
                      <span className="mt-1 hidden text-sm leading-6 text-[#576860] sm:block">查看护士评估、预警提醒和护理记录。</span>
                    </span>
                    <ChevronRight className="size-5 text-[#497a62] transition group-hover:translate-x-1" />
                  </button>
                  <button type="button" onClick={() => setActiveWorkspace("data")} className="interactive-surface group flex items-center justify-between rounded-lg border border-[var(--hairline)] bg-white/70 p-3 text-left hover:bg-white md:rounded-xl md:p-4">
                    <span>
                      <span className="block font-semibold text-[#12211c]">看数据变化</span>
                      <span className="mt-1 hidden text-sm leading-6 text-[#576860] sm:block">查看护膝上传的角度、频次、时长和疼痛记录。</span>
                    </span>
                    <ChevronRight className="size-5 text-[#497a62] transition group-hover:translate-x-1" />
                  </button>
                </div>
                <Button asChild size="lg" variant="outline" className="w-full border-[var(--hairline-strong)] bg-white/70 text-[#12211c] hover:bg-white">
                  <Link href="/appointments">拿不准时预约护士</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeWorkspace === "data" ? (
          <div className="family-view-enter grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className={cn(panelClass, "overflow-hidden") }>
              <CardHeader className="pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8f6427]">Brace Data</p>
                <CardTitle className="display-md mt-2 text-xl md:text-2xl">数据趋势与设备同步</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-5 pt-2 md:p-6 md:pt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className={cn(darkPanelClass, "p-4 md:p-5") }>
                    <div className="flex items-center justify-between text-sm text-[#b6c6bc]">
                      <span>同步状态</span>
                      <Radio className="size-5 text-[#ddb474]" />
                    </div>
                    <div className="mt-5 flex items-center gap-3 md:mt-8 md:gap-4">
                      <span className={`sync-dot size-5 rounded-full shadow-e3 ${hardwareOnline ? "bg-emerald-300 shadow-emerald-300/50" : "bg-amber-300 shadow-amber-300/40"}`} />
                      <p className="text-2xl font-semibold tracking-tight md:text-3xl">{stateLabel}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#b6c6bc] md:mt-4 md:text-base md:leading-7">{patient ? `${patient.name}，${patient.age} 岁，${patient.roomNumber ?? "居家康复"}` : "正在读取家人信息"}</p>
                  </div>

                  <MetricEducationDialog metric="flexion">
                    <button className={cn(quietPanelClass, "p-6 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-e3") }>
                      <div className="flex items-center justify-between text-sm text-[#576860]">
                        <span>{flexionLabel}</span>
                        <Activity className="size-5 text-[#497a62]" />
                      </div>
                      <p className="tabular mt-3 text-5xl font-semibold tracking-normal text-[#3c6552] md:mt-5 md:text-6xl">{flexionDisplay}</p>
                      <p className="mt-3 text-base leading-7 text-[#576860]">目标角度 {patient?.targetFlexion ?? 110}°，点击查看康复科普。</p>
                    </button>
                  </MetricEducationDialog>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard icon={Activity} metric="extension" label="伸直度" value={`${extension.toFixed(0)}°`} tone="text-[#2f6076]" />
                  <MetricCard icon={HeartPulse} metric="frequency" label="活动频次" value={`${frequency} 次`} tone="text-[#3c6552]" />
                  <MetricCard icon={CheckCircle2} metric="duration" label="训练时长" value={`${duration} 分钟`} tone="text-[#8f6427]" />
                  <MetricCard icon={BatteryCharging} metric="battery" label="传感器电量" value={battery === null ? "暂未读取" : `${battery}%`} tone="text-[#3c6552]" />
                </div>
              </CardContent>
            </Card>

            <Card className={panelClass}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#8f6427]">测量记录</p>
                  <CardTitle className="display-md mt-2 text-xl md:text-2xl">最近自动上传</CardTitle>
                </div>
                {patient ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/sensor-live?patientId=${encodeURIComponent(patient.id)}`}>
                      <Radio className="size-4" />实时原始帧
                    </Link>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {recentRecords.length === 0 ? (
                  <p className="rounded-xl bg-white/70 p-5 text-[#576860]">等待第一条智能护膝数据。</p>
                ) : (
                  recentRecords.map((record) => (
                    <div key={record.id} className="rounded-xl border border-[var(--hairline)] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-[#12211c]">{formatTime(record.recordedAt)}</p>
                          <p className="mt-1 text-sm text-[#576860]">来源：{record.source === "HARDWARE" ? "真实设备测量" : record.source === "MANUAL" ? "人工记录" : record.source === "DEMO" ? "演示数据" : "智能护具"}</p>
                        </div>
                        <Badge variant={record.flexionAngle < 78 ? "destructive" : "success"}>{record.flexionAngle.toFixed(0)}°</Badge>
                      </div>
                      <Separator className="my-3 bg-[#e5dbc9]" />
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <span className="rounded-2xl bg-[#e2ede6] px-2 py-2 text-[#3c6552]">频次 {record.activityFrequency}</span>
                        <span className="rounded-2xl bg-[#f2ebdf] px-2 py-2 text-[#2f6076]">时长 {record.activityDuration}m</span>
                        <span className="rounded-2xl bg-[#fbf1dd] px-2 py-2 text-[#6f4c1c]">疼痛 {record.painScore}/10</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeWorkspace === "nurse" ? (
          <div className="family-view-enter grid gap-5 lg:grid-cols-2">
            <Card className={cn(panelClass, "bg-[#fcf4e4]") }>
              <CardHeader>
                <p className="text-xs font-semibold text-[#8f6427]">分析与人工确认</p>
                <CardTitle className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-normal">
                  <Sparkles className="size-7 text-[#8f6427]" />
                  护士评估
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestAnalysis ? (
                  <div className="rounded-xl border border-[var(--hairline)] bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge>系统初步分析 · 等待护士确认</Badge>
                      <span className="text-sm text-[#576860]">{formatTime(latestAnalysis.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-base leading-7 text-[#4d5c53]">{latestAnalysis.report}</p>
                    <p className="mt-4 rounded-xl bg-[#fbf1dd] px-4 py-3 text-sm leading-7 text-[#6f4c1c]">护士会先确认家人的疼痛、睡眠和情绪，再结合数据判断训练强度，不会只用一个角度评价恢复好坏。</p>
                    <p className="mt-3 rounded-xl bg-[#e2ede6] px-4 py-3 text-base font-semibold leading-7 text-[#3c6552]">{latestAnalysis.recommendation}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-white/60 p-5 text-[#576860]">
                    <p className="text-lg font-medium text-[#12211c]">等待护士评估</p>
                    <p className="mt-2 leading-7">护士评估后，家属可在这里查看康复建议、注意事项和下一步安排。</p>
                  </div>
                )}
                <Button asChild size="lg" variant="outline" className="w-full border-[var(--hairline-strong)] bg-white/70 text-[#12211c] hover:bg-white">
                  <Link href="/family/guidance">查看全部指导建议</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className={panelClass}>
              <CardHeader>
                <p className="text-xs font-semibold text-[#8f6427]">护士处理记录</p>
                <CardTitle className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-normal">
                  <FileText className="size-7 text-[#497a62]" />
                  护士处理动态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestAlert ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant={latestAlert.status === "RESOLVED" ? "success" : "destructive"}>{latestAlert.status === "RESOLVED" ? "已处理" : "待护士处理"}</Badge>
                      <span className="text-sm text-red-700">{formatTime(latestAlert.createdAt)}</span>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <AlertTriangle className="mt-1 size-5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-medium">{latestAlert.title}</p>
                        <p className="mt-2 text-sm leading-6 text-red-800">{latestAlert.message}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {latestGuidance ? (
                  <div className="rounded-xl border border-[var(--hairline)] bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="success">护士已同步处理建议</Badge>
                      <span className="text-sm text-[#576860]">{formatTime(latestGuidance.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-base font-semibold leading-7 text-[#12211c]">{latestGuidance.guidance}</p>
                    {latestGuidance.notes ? <p className="mt-3 rounded-xl bg-[#f2ebdf] px-4 py-3 text-sm leading-6 text-[#2f6076]">{latestGuidance.notes}</p> : null}
                  </div>
                ) : null}

                {!latestAlert && !latestGuidance ? (
                  <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-white/60 p-5 text-[#576860]">
                    <p className="text-lg font-medium text-[#12211c]">暂无新的护士处理动态</p>
                    <p className="mt-2 leading-7">暂时没有新的护士留言，这不代表身体一定没有问题。如有疼痛、肿胀或不放心，请暂停训练并预约护士一起看。</p>
                  </div>
                ) : null}

                <Button asChild size="lg" className="w-full">
                  <Link href="/appointments">预约护士一起判断</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeWorkspace === "care" ? (
          <div className="family-view-enter grid gap-5">
            <Card className={cn(panelClass, "overflow-hidden bg-[#fcf4e4]") }>
              <CardContent className="grid gap-5 p-5 md:grid-cols-[1.05fr_1.4fr] md:p-6">
                <div className={cn(darkPanelClass, "p-4 md:p-5") }>
                  <Badge className="bg-[#ddb474] text-[#12211c]">护理人文关怀</Badge>
                  <div className="mt-5 flex items-start gap-3">
                    <HeartHandshake className="mt-1 size-8 shrink-0 text-[#ddb474]" />
                    <div>
                      <h2 className="display-md text-2xl md:text-[1.75rem]">训练有节奏，照护有回应。</h2>
                      <p className="mt-4 text-sm leading-7 text-[#c9d6ce] md:text-base">疼痛、肿胀、睡眠和情绪变化都可以被记录、被看见，并及时交给护士判断。</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {carePromiseCards.map((item) => (
                    <div key={item.title} className="rounded-xl border border-[var(--hairline)] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-base font-semibold text-[#12211c]">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[#576860]">{item.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className={panelClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-3xl font-semibold tracking-normal">
                    <HeartPulse className="size-7 text-[#497a62]" />
                    家属须知
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-base leading-8 text-[#4d5c53]">
                  <p>1. 训练前先问家人“今天哪里最不舒服”，再看切口、肿胀和疼痛变化。</p>
                  <p>2. 家属的语气会影响康复信心，尽量用“我们一起试一点点”代替“你必须多练”。</p>
                  <p>3. 若家人暂时不方便操作，家属可以代为查看数据、确认预约、阅读指导，并把担心写进预约需求。</p>
                </CardContent>
              </Card>

              <Card className={panelClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-3xl font-semibold tracking-normal">
                    <Sparkles className="size-7 text-[#8f6427]" />
                    护理小贴士
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-base leading-8 text-[#4d5c53]">
                  <p>• 训练后先让家人坐稳休息，再轻轻放松小腿和大腿前侧，不要按压切口。</p>
                  <p>• 疼痛、焦虑或睡不好时，不要先责备“练得少”，先记录原因，再联系护士调整节奏。</p>
                  <p>• 夜间起身时请先开灯、坐稳、缓慢站立，家属在旁边扶一把，比催促更安全。</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {careToolCards.map((item) => {
                const Icon = item.icon;

                return (
                  <Link key={item.href} href={item.href} className="group rounded-2xl border border-[var(--hairline)] bg-[#fdfbf7]/92 p-5 shadow-e3 transition-all hover:-translate-y-1 hover:border-[var(--hairline-strong)] hover:bg-white">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-ink-900 text-brass-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition group-hover:scale-105">
                      <Icon className="size-6" />
                    </span>
                    <p className="mt-4 text-lg font-semibold text-[#12211c]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#576860]">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function MetricCard({ icon: Icon, metric, label, value, tone }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; tone: string }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className="rounded-xl border border-[var(--hairline)] bg-white/70 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-e3">
        <div className="flex items-center justify-between text-sm text-[#576860]">
          <span>{label}</span>
          <Icon className={`size-5 ${tone}`} />
        </div>
        <p className={`tabular mt-4 text-3xl font-semibold tracking-normal md:text-4xl ${tone}`}>{value}</p>
        <p className="mt-2 text-xs font-semibold text-[#61716a]">点击查看指标说明</p>
      </button>
    </MetricEducationDialog>
  );
}
