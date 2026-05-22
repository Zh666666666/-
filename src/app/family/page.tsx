"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, BookOpenCheck, CalendarClock, CheckCircle2, ChevronRight, FileText, HeartHandshake, HeartPulse, Home, Radio, Smartphone, Sparkles } from "lucide-react";

import { MetricEducationDialog, type MetricEducationKey } from "@/components/metric-education-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import { createDemoRecord, formatTime, type AiAnalysisItem, type AlertItem, type DashboardData, type KneeDataPoint, type NursingRecordItem, type PatientSummary } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "syncing" | "synced" | "error";
type FamilyWorkspace = "today" | "data" | "nurse" | "care";

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
    title: "把专业话翻译成家常话",
    description: "每条建议都尽量写成家属能照着做、能讲给家人听的语言，减少照护时的不确定。",
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

const panelClass = "rounded-[2rem] border border-[#e7dcc8] bg-[#fffaf2]/95 text-[#17251f] shadow-[0_24px_70px_rgba(46,61,50,0.10)] backdrop-blur";
const quietPanelClass = "rounded-[1.5rem] border border-[#eadfce] bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";
const darkPanelClass = "rounded-[1.75rem] bg-[#17251f] text-white shadow-[0_24px_70px_rgba(23,37,31,0.24)]";

export default function FamilyPage() {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [latestRecord, setLatestRecord] = useState<KneeDataPoint | null>(null);
  const [recentRecords, setRecentRecords] = useState<KneeDataPoint[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysisItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [nursingRecords, setNursingRecords] = useState<NursingRecordItem[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [dailyCheckIn, setDailyCheckIn] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<FamilyWorkspace>("today");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const dashboard = await fetchDashboard();
        const firstPatient = dashboard.patients[0];

        if (cancelled || !firstPatient) {
          return;
        }

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
    if (!patient) {
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

  const stateLabel = uploadState === "syncing" ? "正在同步" : uploadState === "error" ? "等待重试" : "自动同步中";
  const flexion = latestRecord?.flexionAngle ?? recentRecords[0]?.flexionAngle ?? 0;
  const frequency = latestRecord?.activityFrequency ?? recentRecords[0]?.activityFrequency ?? 0;
  const extension = latestRecord?.extensionAngle ?? recentRecords[0]?.extensionAngle ?? 0;
  const duration = latestRecord?.activityDuration ?? recentRecords[0]?.activityDuration ?? 0;
  const battery = latestRecord?.batteryLevel ?? recentRecords[0]?.batteryLevel ?? 92;
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
      : "先完成今日陪伴打卡，再看最新角度和训练时长，不需要一次把所有功能都点一遍。";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe5] px-4 pb-40 pt-4 text-[#17251f] md:px-10 md:pb-10 md:pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_18%_8%,rgba(91,135,111,0.28),transparent_30rem),radial-gradient(circle_at_86%_4%,rgba(235,181,95,0.22),transparent_26rem)]" />
      <div className="pointer-events-none absolute -left-24 top-64 h-64 w-64 rounded-full bg-[#dfcaa8]/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-20 right-0 h-72 w-72 rounded-full bg-[#9fc4b1]/25 blur-3xl" />

      <section className="relative mx-auto flex max-w-6xl flex-col gap-5 md:gap-6">
        <header className="family-view-enter relative overflow-hidden rounded-[2.5rem] bg-[#17251f] p-5 text-white shadow-[0_32px_90px_rgba(23,37,31,0.28)] md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#d7a75f]/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-px w-80 bg-gradient-to-r from-transparent via-[#f4d18a]/70 to-transparent" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div>
              <Badge className="border border-white/15 bg-white/10 px-3 py-1 text-[#f8deb0] shadow-none">
                家庭照护台 · 智能护膝在线
              </Badge>
              <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-[#fff7e8] md:text-7xl">
                把今天的照护，变成一张清楚的路线图。
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#d6e4da] md:text-lg md:leading-9">
                家属先看到当前最该做的一步，再进入数据、护士建议和照护工具。页面不再把所有功能堆在一起，而是按真实照护节奏展开。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-[#f2c36b] text-[#17251f] shadow-[0_18px_42px_rgba(242,195,107,0.24)] hover:bg-[#ffd27d]">
                  <Link href="/appointments">预约护理</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                  <Link href="/family/profile">个人资料</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/12 bg-white/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur">
              <div className="flex items-center justify-between text-sm text-[#c9dfd2]">
                <span>{patient ? `${patient.name} · ${patient.age} 岁` : "正在读取家人信息"}</span>
                <span className="flex items-center gap-2 rounded-full bg-emerald-300/15 px-3 py-1 text-emerald-100">
                  <span className="sync-dot size-2 rounded-full bg-emerald-300" />
                  {stateLabel}
                </span>
              </div>
              <div className="mt-8 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-[#c9dfd2]">最新屈曲角度</p>
                  <p className="mt-2 text-6xl font-black tracking-[-0.08em] text-[#fff7e8]">{flexion.toFixed(0)}°</p>
                </div>
                <div className="rounded-2xl bg-[#fff7e8] px-4 py-3 text-right text-[#17251f]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6f6a5d]">Target</p>
                  <p className="mt-1 text-2xl font-black">{patient?.targetFlexion ?? 110}°</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <nav className="family-view-enter grid gap-2 rounded-[2rem] border border-[#e1d3bd] bg-[#fffaf2]/82 p-2 shadow-[0_18px_60px_rgba(46,61,50,0.08)] backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
          {familyWorkspaces.map((item, index) => {
            const Icon = item.icon;
            const active = activeWorkspace === item.value;

            return (
              <button
                key={item.value}
                type="button"
                className={cn(
                  "group rounded-[1.45rem] p-4 text-left transition-all duration-300",
                  active ? "bg-[#17251f] text-white shadow-[0_18px_45px_rgba(23,37,31,0.22)]" : "text-[#4c5b50] hover:bg-white/80 hover:text-[#17251f]",
                )}
                onClick={() => setActiveWorkspace(item.value)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("flex size-10 items-center justify-center rounded-2xl transition", active ? "bg-[#f2c36b] text-[#17251f]" : "bg-[#eef1e8] text-[#5b876f] group-hover:bg-[#e2eadf]") }>
                    <Icon className="size-5" />
                  </span>
                  <span className={cn("text-xs font-black tracking-[0.16em]", active ? "text-[#f2c36b]" : "text-[#a28f73]")}>0{index + 1}</span>
                </div>
                <p className="mt-4 text-lg font-black">{item.label}</p>
                <p className={cn("mt-1 text-xs leading-5", active ? "text-[#d6e4da]" : "text-[#718174]")}>{item.helper}</p>
              </button>
            );
          })}
        </nav>

        {activeWorkspace === "today" ? (
          <div className="family-view-enter grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
            <Card className={cn(panelClass, "overflow-hidden") }>
              <CardHeader className="pb-2">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Today Rhythm</p>
                <CardTitle className="mt-2 text-3xl font-black tracking-[-0.03em] md:text-4xl">今日照护节奏</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-5 pt-2 md:p-6 md:pt-2">
                <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                  <div className={cn(darkPanelClass, "p-5") }>
                    <div className="flex items-center justify-between text-sm text-[#c9dfd2]">
                      <span>同步状态</span>
                      <Radio className="size-5 text-[#f2c36b]" />
                    </div>
                    <div className="mt-8 flex items-center gap-4">
                      <span className="sync-dot size-5 rounded-full bg-emerald-300 shadow-lg shadow-emerald-300/50" />
                      <p className="text-3xl font-black tracking-tight">{stateLabel}</p>
                    </div>
                    <p className="mt-4 leading-7 text-[#c9dfd2]">{patient ? `${patient.name}，${patient.roomNumber ?? "居家康复"}` : "正在读取家人信息"}</p>
                  </div>

                  <MetricEducationDialog metric="flexion">
                    <button className={cn(quietPanelClass, "group p-6 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_55px_rgba(46,61,50,0.12)]") }>
                      <div className="flex items-center justify-between text-sm text-[#718174]">
                        <span>今天最关键指标</span>
                        <Activity className="size-5 text-[#5b876f]" />
                      </div>
                      <p className="mt-5 text-6xl font-black tracking-[-0.08em] text-[#2f6f55] md:text-7xl">{flexion.toFixed(0)}°</p>
                      <p className="mt-3 text-base leading-7 text-[#5d6c61]">目标角度 {patient?.targetFlexion ?? 110}°，点击查看康复科普。</p>
                    </button>
                  </MetricEducationDialog>
                </div>

                <div className={cn(quietPanelClass, "p-5") }>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b0823d]">Companion Check</p>
                      <p className="mt-3 max-w-2xl text-base leading-7 text-[#4c5b50]">{encouragement}</p>
                    </div>
                    <Button size="lg" className="bg-[#17251f] text-white shadow-[0_18px_40px_rgba(23,37,31,0.18)] hover:bg-[#243d33]" onClick={() => setDailyCheckIn(true)} disabled={dailyCheckIn}>
                      <CheckCircle2 className="size-5" />
                      {dailyCheckIn ? "今日已陪伴" : "完成陪伴"}
                    </Button>
                  </div>
                  <div className="mt-5 grid gap-2 md:grid-cols-3">
                    {companionPlan.map((item, index) => (
                      <p key={item} className="rounded-[1.25rem] bg-[#edf2e7] px-4 py-3 text-sm font-bold leading-6 text-[#315242]">
                        <span className="mr-2 text-[#b0823d]">{index + 1}</span>{item}
                      </p>
                    ))}
                  </div>
                  {dailyCheckIn ? (
                    <div className="mt-5 rounded-[1.25rem] bg-[#17251f] px-4 py-4 text-white">
                      <div className="flex items-center gap-3">
                        <Sparkles className="size-6 animate-bounce text-[#f2c36b]" />
                        <p className="font-bold">打卡完成，今天已经为康复迈出稳稳的一步。</p>
                      </div>
                      <p className="mt-2 leading-7 text-[#d6e4da]">您今天做的不只是点一次打卡，而是在告诉家人：恢复慢一点也没关系，我们一起把这段路走稳。</p>
                    </div>
                  ) : null}
                </div>

                {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700">{error}</p> : null}
              </CardContent>
            </Card>

            <Card className={cn(panelClass, "bg-[#fff6e6]") }>
              <CardHeader>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Care Compass</p>
                <CardTitle className="mt-2 text-3xl font-black tracking-[-0.03em]">下一步提醒</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="rounded-[1.5rem] bg-white/70 p-5 text-xl font-black leading-9 text-[#17251f] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">{nextCareStep}</p>
                <div className="grid gap-3">
                  <button type="button" onClick={() => setActiveWorkspace("nurse")} className="group flex items-center justify-between rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_45px_rgba(46,61,50,0.10)]">
                    <span>
                      <span className="block font-black text-[#17251f]">看护士建议</span>
                      <span className="mt-1 block text-sm leading-6 text-[#718174]">把 AI 分析、预警和护理记录放在同一处看。</span>
                    </span>
                    <ChevronRight className="size-5 text-[#5b876f] transition group-hover:translate-x-1" />
                  </button>
                  <button type="button" onClick={() => setActiveWorkspace("data")} className="group flex items-center justify-between rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_45px_rgba(46,61,50,0.10)]">
                    <span>
                      <span className="block font-black text-[#17251f]">看数据变化</span>
                      <span className="mt-1 block text-sm leading-6 text-[#718174]">只看护膝数据和最近上传，不被其他内容打扰。</span>
                    </span>
                    <ChevronRight className="size-5 text-[#5b876f] transition group-hover:translate-x-1" />
                  </button>
                </div>
                <Button asChild size="lg" variant="outline" className="w-full border-[#d8c8ad] bg-white/70 text-[#17251f] hover:bg-white">
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
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Brace Data</p>
                <CardTitle className="mt-2 text-3xl font-black tracking-[-0.03em] md:text-4xl">数据趋势与设备同步</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-5 pt-2 md:p-6 md:pt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className={cn(darkPanelClass, "p-5") }>
                    <div className="flex items-center justify-between text-sm text-[#c9dfd2]">
                      <span>同步状态</span>
                      <Radio className="size-5 text-[#f2c36b]" />
                    </div>
                    <div className="mt-8 flex items-center gap-4">
                      <span className="sync-dot size-5 rounded-full bg-emerald-300 shadow-lg shadow-emerald-300/50" />
                      <p className="text-3xl font-black tracking-tight">{stateLabel}</p>
                    </div>
                    <p className="mt-4 leading-7 text-[#c9dfd2]">{patient ? `${patient.name}，${patient.age} 岁，${patient.roomNumber ?? "居家康复"}` : "正在读取家人信息"}</p>
                  </div>

                  <MetricEducationDialog metric="flexion">
                    <button className={cn(quietPanelClass, "p-6 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_55px_rgba(46,61,50,0.12)]") }>
                      <div className="flex items-center justify-between text-sm text-[#718174]">
                        <span>最新屈曲角度</span>
                        <Activity className="size-5 text-[#5b876f]" />
                      </div>
                      <p className="mt-5 text-6xl font-black tracking-[-0.08em] text-[#2f6f55] md:text-7xl">{flexion.toFixed(0)}°</p>
                      <p className="mt-3 text-base leading-7 text-[#5d6c61]">目标角度 {patient?.targetFlexion ?? 110}°，点击查看康复科普。</p>
                    </button>
                  </MetricEducationDialog>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard icon={Activity} metric="extension" label="伸直度" value={`${extension.toFixed(0)}°`} tone="text-[#2f5f8f]" />
                  <MetricCard icon={HeartPulse} metric="frequency" label="活动频次" value={`${frequency} 次`} tone="text-[#2f6f55]" />
                  <MetricCard icon={CheckCircle2} metric="duration" label="训练时长" value={`${duration} 分钟`} tone="text-[#b0823d]" />
                  <MetricCard icon={BatteryCharging} metric="battery" label="护膝电量" value={`${battery}%`} tone="text-[#2f6f55]" />
                </div>
              </CardContent>
            </Card>

            <Card className={panelClass}>
              <CardHeader>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Upload Log</p>
                <CardTitle className="mt-2 text-3xl font-black tracking-[-0.03em]">最近自动上传</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentRecords.length === 0 ? (
                  <p className="rounded-[1.5rem] bg-white/70 p-5 text-[#718174]">等待第一条智能护膝数据。</p>
                ) : (
                  recentRecords.map((record) => (
                    <div key={record.id} className="rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-black text-[#17251f]">{formatTime(record.recordedAt)}</p>
                          <p className="mt-1 text-sm text-[#718174]">来源：智能护膝自动采集</p>
                        </div>
                        <Badge variant={record.flexionAngle < 78 ? "destructive" : "success"}>{record.flexionAngle.toFixed(0)}°</Badge>
                      </div>
                      <Separator className="my-3 bg-[#eadfce]" />
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <span className="rounded-2xl bg-[#edf2e7] px-2 py-2 text-[#315242]">频次 {record.activityFrequency}</span>
                        <span className="rounded-2xl bg-[#e8eff2] px-2 py-2 text-[#2f5f8f]">时长 {record.activityDuration}m</span>
                        <span className="rounded-2xl bg-[#fff1cf] px-2 py-2 text-[#8a5b15]">疼痛 {record.painScore}/10</span>
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
            <Card className={cn(panelClass, "bg-[#fff6e6]") }>
              <CardHeader>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Clinical Reading</p>
                <CardTitle className="mt-2 flex items-center gap-3 text-3xl font-black tracking-[-0.03em]">
                  <Sparkles className="size-7 text-[#b0823d]" />
                  AI 分析
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestAnalysis ? (
                  <div className="rounded-[1.5rem] border border-[#eadfce] bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge className="bg-[#17251f] text-white">护士端已分析</Badge>
                      <span className="text-sm text-[#718174]">{formatTime(latestAnalysis.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-base leading-7 text-[#4c5b50]">{latestAnalysis.report}</p>
                    <p className="mt-4 rounded-[1.25rem] bg-[#fff1cf] px-4 py-3 text-sm leading-7 text-[#7a571b]">护士会先确认家人的疼痛、睡眠和情绪，再结合数据判断训练强度，不会只用一个角度评价恢复好坏。</p>
                    <p className="mt-3 rounded-[1.25rem] bg-[#edf2e7] px-4 py-3 text-base font-semibold leading-7 text-[#315242]">{latestAnalysis.recommendation}</p>
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-[#d8c8ad] bg-white/60 p-5 text-[#718174]">
                    <p className="text-lg font-bold text-[#17251f]">等待护士端 AI 智能分析</p>
                    <p className="mt-2 leading-7">护士完成分析后，系统会把专业判断和适合家属转述的安抚建议同步到这里。</p>
                  </div>
                )}
                <Button asChild size="lg" variant="outline" className="w-full border-[#d8c8ad] bg-white/70 text-[#17251f] hover:bg-white">
                  <Link href="/family/guidance">查看全部指导建议</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className={panelClass}>
              <CardHeader>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Nurse Timeline</p>
                <CardTitle className="mt-2 flex items-center gap-3 text-3xl font-black tracking-[-0.03em]">
                  <FileText className="size-7 text-[#5b876f]" />
                  护士处理动态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestAlert ? (
                  <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-red-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant={latestAlert.status === "RESOLVED" ? "success" : "destructive"}>{latestAlert.status === "RESOLVED" ? "已处理" : "待护士处理"}</Badge>
                      <span className="text-sm text-red-700">{formatTime(latestAlert.createdAt)}</span>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <AlertTriangle className="mt-1 size-5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-bold">{latestAlert.title}</p>
                        <p className="mt-2 text-sm leading-6 text-red-800">{latestAlert.message}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {latestGuidance ? (
                  <div className="rounded-[1.5rem] border border-[#d8c8ad] bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="success">护士已同步处理建议</Badge>
                      <span className="text-sm text-[#718174]">{formatTime(latestGuidance.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-base font-semibold leading-7 text-[#17251f]">{latestGuidance.guidance}</p>
                    {latestGuidance.notes ? <p className="mt-3 rounded-[1.25rem] bg-[#e8eff2] px-4 py-3 text-sm leading-6 text-[#2f5f8f]">{latestGuidance.notes}</p> : null}
                  </div>
                ) : null}

                {!latestAlert && !latestGuidance ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[#d8c8ad] bg-white/60 p-5 text-[#718174]">
                    <p className="text-lg font-bold text-[#17251f]">暂无新的护士处理动态</p>
                    <p className="mt-2 leading-7">暂时没有新的处理动态，说明当前不需要额外干预。若家属仍然担心，可以通过预约护理把疑问交给护士一起看。</p>
                  </div>
                ) : null}

                <Button asChild size="lg" className="w-full bg-[#17251f] text-white shadow-[0_18px_40px_rgba(23,37,31,0.18)] hover:bg-[#243d33]">
                  <Link href="/appointments">预约护士一起判断</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeWorkspace === "care" ? (
          <div className="family-view-enter grid gap-5">
            <Card className={cn(panelClass, "overflow-hidden bg-[#fff6e6]") }>
              <CardContent className="grid gap-5 p-5 md:grid-cols-[1.05fr_1.4fr] md:p-6">
                <div className={cn(darkPanelClass, "p-5") }>
                  <Badge className="bg-[#f2c36b] text-[#17251f]">护理人文关怀</Badge>
                  <div className="mt-5 flex items-start gap-3">
                    <HeartHandshake className="mt-1 size-8 shrink-0 text-[#f2c36b]" />
                    <div>
                      <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.04em] md:text-4xl">康复不是一张曲线，是一家人一起走的一段路。</h2>
                      <p className="mt-4 text-sm leading-7 text-[#d6e4da] md:text-base">这里的每一次提醒，都希望让家属更安心、让家人更有尊严，也让护士的专业照护真正到达家里。</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {carePromiseCards.map((item) => (
                    <div key={item.title} className="rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                      <p className="text-base font-black text-[#17251f]">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[#5d6c61]">{item.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className={panelClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-3xl font-black tracking-[-0.03em]">
                    <HeartPulse className="size-7 text-[#5b876f]" />
                    家属须知
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-base leading-8 text-[#4c5b50]">
                  <p>1. 训练前先问家人“今天哪里最不舒服”，再看切口、肿胀和疼痛变化。</p>
                  <p>2. 家属的语气会影响康复信心，尽量用“我们一起试一点点”代替“你必须多练”。</p>
                  <p>3. 若家人暂时不方便操作，家属可以代为查看数据、确认预约、阅读指导，并把担心写进预约需求。</p>
                </CardContent>
              </Card>

              <Card className={panelClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-3xl font-black tracking-[-0.03em]">
                    <Sparkles className="size-7 text-[#b0823d]" />
                    护理小贴士
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-base leading-8 text-[#4c5b50]">
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
                  <Link key={item.href} href={item.href} className="group rounded-[1.75rem] border border-[#e7dcc8] bg-[#fffaf2]/92 p-5 shadow-[0_18px_55px_rgba(46,61,50,0.08)] transition-all hover:-translate-y-1 hover:border-[#c7b18e] hover:bg-white">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-[#17251f] text-[#f2c36b] transition group-hover:scale-105">
                      <Icon className="size-6" />
                    </span>
                    <p className="mt-4 text-lg font-black text-[#17251f]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#5d6c61]">{item.description}</p>
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
      <button className="rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_45px_rgba(46,61,50,0.10)]">
        <div className="flex items-center justify-between text-sm text-[#718174]">
          <span>{label}</span>
          <Icon className={`size-5 ${tone}`} />
        </div>
        <p className={`mt-4 text-3xl font-black tracking-[-0.05em] md:text-4xl ${tone}`}>{value}</p>
        <p className="mt-2 text-xs font-semibold text-[#9a8a72]">点击查看指标说明</p>
      </button>
    </MetricEducationDialog>
  );
}
