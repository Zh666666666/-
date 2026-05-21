"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, CheckCircle2, FileText, HeartPulse, Radio, Smartphone, Sparkles } from "lucide-react";

import { MetricEducationDialog, type MetricEducationKey } from "@/components/metric-education-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import { createDemoRecord, formatTime, type AiAnalysisItem, type AlertItem, type DashboardData, type KneeDataPoint, type NursingRecordItem, type PatientSummary } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";

type UploadState = "idle" | "syncing" | "synced" | "error";

async function fetchDashboard() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Dashboard request failed");
  }

  return (await response.json()) as DashboardData;
}

export default function FamilyPage() {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [latestRecord, setLatestRecord] = useState<KneeDataPoint | null>(null);
  const [recentRecords, setRecentRecords] = useState<KneeDataPoint[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysisItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [nursingRecords, setNursingRecords] = useState<NursingRecordItem[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [dailyCheckIn, setDailyCheckIn] = useState(false);
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
    ? `今天${honorific}的膝关节活动度在稳步进步，继续加油！我们和您一起守护家人健康。`
    : "我们会陪着您一起记录每一次康复变化，慢慢来，恢复会越来越好。";

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto flex max-w-6xl flex-col gap-5 md:gap-6">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-emerald-100 bg-white/90 p-5 shadow-sm backdrop-blur md:rounded-[2rem] md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <Badge variant="success" className="w-fit gap-2 px-3 py-1 text-sm">
              <span className="sync-dot size-2 rounded-full bg-emerald-500" />
              智能护膝已连接
            </Badge>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight md:text-6xl">家属端康复守护</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 md:text-xl md:leading-9">家属可以随时了解家人的恢复进度，智能护膝每 5 秒自动上传屈曲角度、活动频次和训练时长，护士端也会及时给出专业支持。</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
            <Button asChild size="lg" variant="outline" className="hidden lg:inline-flex">
              <Link href="/family/profile">个人资料</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="hidden lg:inline-flex">
              <Link href="/family/guidance">指导建议</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="hidden lg:inline-flex">
              <Link href="/family/devices">设备绑定</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="hidden lg:inline-flex">
              <Link href="/appointments">预约护理</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="hidden lg:inline-flex">
              <Link href="/family/tcm-knowledge">中医康复</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-white via-emerald-50/80 to-sky-50/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Smartphone className="size-7 text-emerald-700" />
                零操作同步终端
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-6 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/15">
                  <div className="flex items-center justify-between text-sm text-emerald-100">
                    <span>同步状态</span>
                    <Radio className="size-5" />
                  </div>
                  <div className="mt-7 flex items-center gap-4">
                    <span className="sync-dot size-5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                    <p className="text-3xl font-black tracking-tight md:text-4xl">{stateLabel}</p>
                  </div>
                  <p className="mt-4 leading-7 text-slate-300">{patient ? `${patient.name}，${patient.age} 岁，${patient.roomNumber ?? "居家康复"}` : "正在读取家人信息"}</p>
                </div>

                <MetricEducationDialog metric="flexion">
                  <button className="rounded-3xl border border-emerald-100 bg-white/90 p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>最新屈曲角度</span>
                      <Activity className="size-5 text-emerald-700" />
                    </div>
                    <p className="mt-5 text-5xl font-black tracking-tight text-emerald-700 md:text-6xl">{flexion.toFixed(0)}°</p>
                    <p className="mt-3 text-lg text-slate-600">目标角度 {patient?.targetFlexion ?? 110}°，点击查看康复科普。</p>
                  </button>
                </MetricEducationDialog>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard icon={Activity} metric="extension" label="伸直度" value={`${extension.toFixed(0)}°`} tone="text-blue-700" />
                <MetricCard icon={HeartPulse} metric="frequency" label="活动频次" value={`${frequency} 次`} tone="text-sky-700" />
                <MetricCard icon={CheckCircle2} metric="duration" label="训练时长" value={`${duration} 分钟`} tone="text-amber-700" />
                <MetricCard icon={BatteryCharging} metric="battery" label="护膝电量" value={`${battery}%`} tone="text-emerald-700" />
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">每日康复打卡</p>
                    <p className="mt-2 text-base leading-7 text-slate-700">{encouragement}</p>
                  </div>
                  <Button size="lg" variant="elder" onClick={() => setDailyCheckIn(true)} disabled={dailyCheckIn}>
                    <CheckCircle2 className="size-5" />
                    {dailyCheckIn ? "今日已打卡" : "完成打卡"}
                  </Button>
                </div>
                {dailyCheckIn ? (
                  <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-900">
                    <div className="flex items-center gap-3">
                      <Sparkles className="size-6 animate-bounce text-emerald-600" />
                      <p className="font-bold">打卡完成，今天已经为康复迈出稳稳的一步。</p>
                    </div>
                    <p className="mt-2 leading-7">我们和您一起守护家人健康，记得多鼓励、多陪伴，训练后留意休息和补水。</p>
                  </div>
                ) : null}
              </div>

              {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-gradient-to-br from-white via-amber-50/80 to-emerald-50/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Sparkles className="size-7 text-amber-600" />
                AI 分析
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestAnalysis ? (
                <div className="rounded-3xl border border-amber-100 bg-white/90 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge className="bg-amber-600 text-white">护士端已分析</Badge>
                    <span className="text-sm text-slate-500">{formatTime(latestAnalysis.createdAt)}</span>
                  </div>
                  <p className="mt-4 text-base leading-7 text-slate-700">{latestAnalysis.report}</p>
                  <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-semibold leading-7 text-emerald-900">{latestAnalysis.recommendation}</p>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-amber-200 bg-white/80 p-5 text-slate-600">
                  <p className="text-lg font-bold text-slate-800">等待护士端 AI 智能分析</p>
                  <p className="mt-2 leading-7">护士点击“AI智能分析”后，报告会实时同步到这里。</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-sky-100 bg-gradient-to-br from-white via-sky-50/80 to-emerald-50/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <FileText className="size-7 text-sky-700" />
                护士处理动态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestAlert ? (
                <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-red-950">
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
                <div className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="success">护士已同步处理建议</Badge>
                    <span className="text-sm text-slate-500">{formatTime(latestGuidance.createdAt)}</span>
                  </div>
                  <p className="mt-4 text-base font-semibold leading-7 text-slate-800">{latestGuidance.guidance}</p>
                  {latestGuidance.notes ? <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">{latestGuidance.notes}</p> : null}
                </div>
              ) : null}

              {!latestAlert && !latestGuidance ? (
                <div className="rounded-3xl border border-dashed border-sky-200 bg-white/80 p-5 text-slate-600">
                  <p className="text-lg font-bold text-slate-800">暂无新的护士处理动态</p>
                  <p className="mt-2 leading-7">护士端处理预警后，远程指导、个性化建议和上门护理安排会自动同步到这里，我们会一直陪伴家人恢复。</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle className="text-2xl">最近自动上传</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentRecords.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-5 text-slate-500">等待第一条智能护膝数据。</p>
              ) : (
                recentRecords.map((record) => (
                  <div key={record.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold">{formatTime(record.recordedAt)}</p>
                        <p className="mt-1 text-sm text-slate-500">来源：智能护膝自动采集</p>
                      </div>
                      <Badge variant={record.flexionAngle < 78 ? "destructive" : "success"}>{record.flexionAngle.toFixed(0)}°</Badge>
                    </div>
                    <Separator className="my-3" />
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <span className="rounded-2xl bg-emerald-50 px-2 py-2 text-emerald-800">频次 {record.activityFrequency}</span>
                      <span className="rounded-2xl bg-sky-50 px-2 py-2 text-sky-800">时长 {record.activityDuration}m</span>
                      <span className="rounded-2xl bg-amber-50 px-2 py-2 text-amber-800">疼痛 {record.painScore}/10</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-emerald-100 bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <HeartPulse className="size-7 text-emerald-700" />
                  家属须知
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-base leading-8 text-slate-700">
                <p>1. 每次训练前后留意切口、肿胀和疼痛变化，若有明显加重请及时联系护士。</p>
                <p>2. 您的陪伴和鼓励会直接影响康复依从性，建议把每次进步都记录下来。</p>
                <p>3. 若家人暂时不方便操作，家属可以代为查看数据、确认预约和阅读指导。</p>
              </CardContent>
            </Card>

            <Card className="border-amber-100 bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Sparkles className="size-7 text-amber-600" />
                  护理小贴士
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-base leading-8 text-slate-700">
                <p>• 训练后可以帮家人轻轻按摩小腿和大腿前侧，放松肌肉，不要按压切口。</p>
                <p>• 饮食宜清淡、均衡、易消化，注意补充蛋白质和水分。</p>
                <p>• 夜间起身时请先坐稳、缓慢站立，避免急转和跌倒。</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon: Icon, metric, label, value, tone }: { icon: typeof Activity; metric: MetricEducationKey; label: string; value: string; tone: string }) {
  return (
    <MetricEducationDialog metric={metric}>
      <button className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{label}</span>
          <Icon className={`size-5 ${tone}`} />
        </div>
        <p className={`mt-4 text-3xl font-black tracking-tight md:text-4xl ${tone}`}>{value}</p>
        <p className="mt-2 text-xs font-semibold text-slate-400">点击查看指标说明</p>
      </button>
    </MetricEducationDialog>
  );
}
