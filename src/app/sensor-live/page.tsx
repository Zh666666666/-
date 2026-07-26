"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Fingerprint,
  Gauge,
  Loader2,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UsersRound,
  Wifi,
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

import { StatusNotice } from "@/components/status-notice";
import { SensorAttitudeScene } from "@/components/sensor-attitude-scene";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RehabMetrics } from "@/lib/rehab-metrics";
import type {
  AiAnalysisItem,
  DashboardData,
  DevicePlacement,
  KneeDataPoint,
  PatientSummary,
  SensorSampleItem,
} from "@/lib/rehab";

type LiveSnapshot = {
  patientId: string;
  updatedAt: string;
  sampleCount: number;
  dualActive: boolean;
  mode: string;
  latest: SensorSampleItem | null;
  latestByPlacement: Partial<Record<DevicePlacement, SensorSampleItem | null>>;
  samples: SensorSampleItem[];
  clinicalRecords: KneeDataPoint[];
  metrics: RehabMetrics;
};

const placementLabels: Record<DevicePlacement, string> = {
  THIGH: "大腿",
  SHANK: "小腿",
  BRACE: "护具",
  UNKNOWN: "未指定",
};

const sourceLabels: Record<string, string> = {
  HARDWARE: "真实硬件",
  DEMO: "演示",
  SMART_BRACE: "智能护具",
  MANUAL: "人工",
};

const qualityReasonLabels: Record<string, string> = {
  NOT_HARDWARE: "当前不是来自真实传感器的数据",
  CALIBRATION_MISSING: "尚未完成双传感器归零",
  CALIBRATION_MISMATCHED: "归零记录与当前大腿/小腿分配不一致，请重新归零",
  CALIBRATION_NOT_GOOD: "本次归零未通过，请重新佩戴并归零",
  TOO_FEW_SYNCHRONIZED_PAIRS: "两只传感器同时采集的数据还不够",
  OBSERVATION_TOO_SHORT: "训练时间太短，请继续完成至少一次完整屈伸",
  PAIR_SYNC_FAILED: "两只传感器的时间没有对齐，请检查连接后重新训练",
  IRREGULAR_SAMPLING: "采集出现明显中断，请保持手机与传感器连接",
  IMPLAUSIBLE_MOTION: "动作变化超出可信范围，请检查传感器是否松动",
  NO_COMPLETE_MOVEMENT_CYCLE: "尚未识别到一次完整屈伸",
  QUALITY_SCORE_LOW: "当前数据质量总分不足",
};

function qualityReasonLabel(code: string) {
  return qualityReasonLabels[code] ?? `技术复核项：${code}`;
}

function formatClock(value: string | null | undefined) {
  if (!value) return "--:--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(digits);
}

function formatLatency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} s`;
}

function endToEndLatency(sample: SensorSampleItem | null | undefined, nowMs: number) {
  if (!sample) return null;
  const capturedAt = new Date(sample.recordedAt).getTime();
  if (!Number.isFinite(capturedAt)) return null;
  return Math.max(0, nowMs - capturedAt);
}

function isTrustedRealtimeSample(sample: SensorSampleItem | null | undefined, nowMs: number) {
  const latency = endToEndLatency(sample, nowMs);
  return Boolean(
    sample?.source === "HARDWARE"
    && sample.gatewaySampleId
    && sample.ingestIntegrity === "MATCHED"
    && latency !== null
    && latency <= 2_000,
  );
}

function ProvenanceRow({
  placement,
  sample,
  nowMs,
}: {
  placement: "THIGH" | "SHANK";
  sample: SensorSampleItem | null | undefined;
  nowMs: number;
}) {
  const endToEnd = endToEndLatency(sample, nowMs);
  const trusted = isTrustedRealtimeSample(sample, nowMs);
  const shortId = sample?.gatewaySampleId ? sample.gatewaySampleId.slice(-8) : "--------";

  return (
    <div className="grid gap-3 border-t border-slate-200 py-4 first:border-t-0 lg:grid-cols-[0.8fr_1.1fr_1fr_1fr_0.9fr] lg:items-center">
      <div className="flex items-center gap-2">
        {trusted ? <CheckCircle2 className="size-5 text-emerald-700" /> : <AlertTriangle className="size-5 text-amber-700" />}
        <div>
          <p className="font-medium text-[#12211c]">{placementLabels[placement]}</p>
          <p className="text-xs text-slate-500">样本 #{sample?.captureSequence ?? "--"}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">App / 网页共同样本 ID</p>
        <p className="mt-1 font-mono text-sm font-medium text-slate-800">…{shortId}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">手机采集 → 服务器</p>
        <p className="mt-1 font-mono font-medium text-slate-800">{formatLatency(sample?.ingestLatencyMs)}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">采集 → 当前网页</p>
        <p className={`mt-1 font-mono font-medium ${trusted ? "text-emerald-700" : "text-amber-800"}`}>
          {formatLatency(endToEnd)}
        </p>
      </div>
      <Badge variant={trusted ? "success" : "warning"} className="w-fit">
        {trusted ? "2 秒内且数值一致" : sample ? "超时或待核验" : "等待样本"}
      </Badge>
    </div>
  );
}

function modeLabel(mode: string | null | undefined, dualActive: boolean) {
  if (mode === "DUAL_SENSOR" || dualActive) return "双传感器可信";
  if (mode === "SINGLE_SENSOR_PROVISIONAL") return "单传感器临时";
  return "等待样本";
}

function riskLabel(level: RehabMetrics["risk"]["level"]) {
  if (level === "HIGH") return "高风险复核";
  if (level === "WATCH") return "需要关注";
  if (level === "STABLE") return "当前稳定";
  return "数据不足";
}

function riskVariant(level: RehabMetrics["risk"]["level"]): "destructive" | "warning" | "success" | "outline" {
  if (level === "HIGH") return "destructive";
  if (level === "WATCH") return "warning";
  if (level === "STABLE") return "success";
  return "outline";
}

function AxisGrid({
  title,
  x,
  y,
  z,
  unit,
}: {
  title: string;
  x: number | null | undefined;
  y: number | null | undefined;
  z: number | null | undefined;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[#fdfbf7] p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[#576860]">
        {title}
        <span className="ml-1 font-medium normal-case text-slate-400">({unit})</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ["X", x],
          ["Y", y],
          ["Z", z],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-white px-2 py-2 shadow-e1">
            <p className="text-[11px] font-semibold text-slate-400">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#12211c]">
              {formatNumber(value as number | null)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SensorCard({
  placement,
  sample,
}: {
  placement: DevicePlacement;
  sample: SensorSampleItem | null | undefined;
}) {
  const online = Boolean(sample);

  return (
    <Card className="border-[var(--hairline)] bg-white shadow-e2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
            <Radio className="size-5 text-emerald-700" />
            {placementLabels[placement]}传感器
          </CardTitle>
          <Badge variant={online ? "success" : "outline"} className="gap-1">
            <Wifi className="size-3" />
            {online ? "有实时帧" : "暂无数据"}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">
          帧时间 {formatClock(sample?.recordedAt)} · 来源 {sourceLabels[sample?.source ?? ""] ?? "--"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <AxisGrid title="身体移动 / Acc" unit="g" x={sample?.ax} y={sample?.ay} z={sample?.az} />
        <AxisGrid title="转动速度 / Gyro" unit="°/s" x={sample?.gx} y={sample?.gy} z={sample?.gz} />
        <AxisGrid title="佩戴姿态 / Angle" unit="°" x={sample?.roll} y={sample?.pitch} z={sample?.yaw} />
      </CardContent>
    </Card>
  );
}

export default function SensorLivePage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [analysesByPatient, setAnalysesByPatient] = useState<Record<string, AiAnalysisItem | null>>({});
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("康复患者");
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [, setStreamState] = useState<"CONNECTING" | "LIVE" | "FALLBACK">("CONNECTING");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewerRole, setViewerRole] = useState<"family" | "nurse" | null>(null);
  const [showProfessional, setShowProfessional] = useState(false);
  const selectedPatientIdRef = useRef<string | null>(null);
  const liveRequestRef = useRef<{ patientId: string; controller: AbortController } | null>(null);
  const streamRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLive = useCallback(async (id: string) => {
    if (liveRequestRef.current?.patientId === id) return;

    liveRequestRef.current?.controller.abort();
    const request = { patientId: id, controller: new AbortController() };
    liveRequestRef.current = request;
    try {
      const response = await fetch(`/api/sensor-samples?patientId=${encodeURIComponent(id)}&limit=80`, {
        cache: "no-store",
        signal: request.controller.signal,
      });
      if (!response.ok) {
        throw new Error("实时样本读取失败");
      }
      const snapshot = (await response.json()) as LiveSnapshot;
      if (selectedPatientIdRef.current !== id) return;
      setLive(snapshot);
      const observedAt = new Date().toISOString();
      setLastRefresh(observedAt);
      setNowMs(new Date(observedAt).getTime());
    } finally {
      if (liveRequestRef.current === request) liveRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const [dashboardResponse, roleResponse] = await Promise.all([
          fetch("/api/dashboard", { cache: "no-store" }),
          fetch("/api/auth/role", { cache: "no-store" }),
        ]);
        if (!dashboardResponse.ok) {
          throw new Error("患者列表读取失败");
        }
        const dashboard = (await dashboardResponse.json()) as DashboardData;
        let resolvedRole: "family" | "nurse" | null = null;
        if (roleResponse.ok) {
          const rolePayload = (await roleResponse.json()) as { role?: "family" | "nurse" | null };
          resolvedRole = rolePayload.role ?? null;
          setViewerRole(resolvedRole);
        }
        const firstPatient = dashboard.patients[0];
        if (!firstPatient) {
          throw new Error("没有可监测的患者档案");
        }
        if (cancelled) return;

        const requestedId = new URLSearchParams(window.location.search).get("patientId");
        const selectedPatient = resolvedRole === "nurse"
          ? dashboard.patients.find((patient) => patient.id === requestedId) ?? firstPatient
          : firstPatient;
        const latestAnalyses = Object.fromEntries(
          dashboard.patients.map((patient) => [
            patient.id,
            dashboard.aiAnalyses.filter((item) => item.patientId === patient.id).at(-1) ?? null,
          ]),
        ) as Record<string, AiAnalysisItem | null>;
        selectedPatientIdRef.current = selectedPatient.id;
        setPatients(dashboard.patients);
        setAnalysesByPatient(latestAnalyses);
        setPatientId(selectedPatient.id);
        setPatientName(selectedPatient.name);
        setAnalysis(latestAnalyses[selectedPatient.id] ?? null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "实时看板加载失败");
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patientId) return;

    let cancelled = false;
    selectedPatientIdRef.current = patientId;
    setLoading(true);
    setError(null);
    setLive(null);
    setStreamState("CONNECTING");

    const selectedPatient = patients.find((patient) => patient.id === patientId);
    if (selectedPatient) setPatientName(selectedPatient.name);

    const url = new URL(window.location.href);
    url.searchParams.set("patientId", patientId);
    window.history.replaceState(null, "", url);

    void loadLive(patientId)
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "实时看板加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const eventSource = new EventSource(`/api/sensor-samples/stream?patientId=${encodeURIComponent(patientId)}`);
    eventSource.onopen = () => setStreamState("LIVE");
    eventSource.addEventListener("sample", () => {
      if (streamRefreshRef.current) clearTimeout(streamRefreshRef.current);
      streamRefreshRef.current = setTimeout(() => {
        streamRefreshRef.current = null;
        void loadLive(patientId).catch(() => setStreamState("FALLBACK"));
      }, 180);
    });
    eventSource.onerror = () => setStreamState("FALLBACK");

    const timer = setInterval(() => {
      void loadLive(patientId).catch(() => {
        // Keep the last good frame; the next tick retries.
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (streamRefreshRef.current) clearTimeout(streamRefreshRef.current);
      eventSource.close();
      if (liveRequestRef.current?.patientId === patientId) {
        liveRequestRef.current.controller.abort();
        liveRequestRef.current = null;
      }
    };
  }, [loadLive, patientId, patients]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const waveform = useMemo(() => {
    const samples = [...(live?.samples ?? [])].reverse().slice(-30);
    return samples.map((sample) => ({
      time: formatClock(sample.recordedAt),
      flexion: sample.flexionAngle,
      pitch: sample.pitch,
      roll: sample.roll,
      conf: typeof sample.confidence === "number" ? sample.confidence * 100 : null,
    }));
  }, [live?.samples]);

  const clinicalSeries = useMemo(() => {
    return (live?.clinicalRecords ?? []).map((record) => ({
      time: formatClock(record.recordedAt),
      flexion: record.flexionAngle,
      source: record.source,
    }));
  }, [live?.clinicalRecords]);

  async function runAnalysis() {
    if (!patientId) return;
    setAnalyzing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/ai-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const payload = (await response.json()) as AiAnalysisItem & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "分析失败");
      }
      setAnalysis(payload);
      setAnalysesByPatient((current) => ({ ...current, [patientId]: payload }));
      setMessage(`分析完成（${payload.provider}），基于临床趋势记录，不含单传感器临时读数。`);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  const latest = live?.latest ?? null;
  const dualActive = Boolean(live?.dualActive);
  const clinicalReady = Boolean(live?.metrics?.clinicalEligible);
  const metrics = live?.metrics ?? null;
  const hasUsableReading = (metrics?.dataQuality.synchronizedPairs ?? 0) >= 2;
  const thighSample = live?.latestByPlacement?.THIGH;
  const shankSample = live?.latestByPlacement?.SHANK;
  const realtimeQualified = isTrustedRealtimeSample(thighSample, nowMs)
    && isTrustedRealtimeSample(shankSample, nowMs);
  const urgentWarning = metrics?.warnings.find((warning) => warning.severity === "HIGH") ?? null;
  const measurementStatus = metrics?.dataQuality.measurementStatus ?? "COLLECTING";
  const hasObservedTraining = typeof metrics?.rom.value === "number"
    || typeof metrics?.training.activeDurationSeconds === "number";
  const familySafetyTitle = urgentWarning
    ? "请先确认家人是否安全"
    : hasUsableReading
      ? "本次监测未发现明显异常"
      : hasObservedTraining
        ? "动作数据已收到，结论仍待核对"
        : "正在接收本次训练数据";
  const familySafetyDetail = urgentWarning
    ? urgentWarning.action
    : hasUsableReading
      ? "可以继续按护士给出的方案训练；如出现明显疼痛、肿胀或不适，请暂停并联系护士。"
      : hasObservedTraining
        ? "下方数值来自两只传感器的同步实测；质量门未通过前仅作训练预览，不触发风险结论。"
        : "先保持两只设备连接，并缓慢完成一次弯曲再伸直；系统不会把不完整数据当成结论。";
  const nextAction = measurementStatus === "TECHNICAL_ISSUE"
      ? "数据存在不同步或异常跳变，请暂停使用本次结果并检查蓝牙连接。"
      : measurementStatus === "COLLECTING"
        ? dualActive
          ? "两只设备已经连接，请缓慢完成至少一次完整的弯曲再伸直。"
          : "还需要连接大腿和小腿两只设备，当前读数只作实时观察。"
        : "数据质量已经满足训练监测要求，可以查看本次完成情况。";

  function selectPatient(nextPatientId: string) {
    selectedPatientIdRef.current = nextPatientId;
    liveRequestRef.current?.controller.abort();
    liveRequestRef.current = null;
    const selectedPatient = patients.find((patient) => patient.id === nextPatientId);
    if (selectedPatient) setPatientName(selectedPatient.name);
    setLive(null);
    setLastRefresh(null);
    setError(null);
    setMessage(null);
    setAnalysis(analysesByPatient[nextPatientId] ?? null);
    setPatientId(nextPatientId);
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="panel-ink grain rim-light relative overflow-hidden rounded-2xl border border-white/8 p-5 text-white md:p-7">
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="gap-2 border border-white/15 bg-white/10 px-3 py-1 text-sm text-white">
                <Activity className="size-4" />
                家人康复 · 实时动作
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
                现在练得怎么样，一眼看明白。
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#e5dbc9]">
                这里先告诉您设备是否正常、动作完成情况和下一步怎么做。系统拿不准时会明确说“暂时无法判断”，不会把不完整数据当成结论。
              </p>
              <p className="mt-3 text-sm text-[#a8c6b4]">
                患者 {patientName}
                 · 最近更新 {formatClock(lastRefresh)}
              </p>
            </div>
            <div className="grid min-w-full gap-3 rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur lg:min-w-[360px]">
              {viewerRole === "nurse" ? (
                <label className="grid gap-2 text-sm font-medium text-[#e5dbc9]">
                  <span className="flex items-center gap-2"><UsersRound className="size-4" />当前监测患者</span>
                  <select
                    value={patientId ?? ""}
                    onChange={(event) => selectPatient(event.target.value)}
                    className="h-11 rounded-lg border border-white/15 bg-[#1b3129] px-3 text-sm font-semibold text-white outline-none"
                  >
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.id}</option>)}
                  </select>
                </label>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-3">
                  <p className="text-xs text-[#a8c6b4]">当前家人</p>
                  <p className="mt-1 font-medium text-white">{patientName}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                  disabled={!patientId || loading}
                  onClick={() => patientId && void loadLive(patientId)}
                >
                  <RefreshCw className="size-5" />
                  刷新
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                  onClick={() => setShowProfessional((current) => !current)}
                >
                  <BrainCircuit className="size-4" />
                  {showProfessional ? "返回易懂视图" : "专业详情"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-[#e5dbc9]">
                <span className="rounded-lg bg-white/10 px-2 py-2"><b className="block text-base text-white">{realtimeQualified ? "正常" : "检查中"}</b>数据上传</span>
                <span className="rounded-lg bg-white/10 px-2 py-2"><b className="block text-base text-white">{dualActive ? "2 只" : latest ? "1 只" : "0 只"}</b>设备数据</span>
                <span className="rounded-lg bg-white/10 px-2 py-2"><b className="block text-base text-white">{clinicalReady ? "可用" : "等待"}</b>训练评估</span>
              </div>
            </div>
          </div>
        </header>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {message ? <StatusNotice tone="success">{message}</StatusNotice> : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]" aria-label="家属易懂实时状态">
          <Card className={`border-2 shadow-e1 ${urgentWarning ? "border-red-200 bg-red-50" : clinicalReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <CardContent className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                {urgentWarning ? <AlertTriangle className="mt-1 size-6 shrink-0 text-red-700" /> : hasUsableReading ? <ShieldCheck className="mt-1 size-6 shrink-0 text-emerald-700" /> : <ShieldAlert className="mt-1 size-6 shrink-0 text-amber-700" />}
                <div>
                  <p className="text-sm font-medium text-slate-500">现在是否需要注意</p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#12211c]">{familySafetyTitle}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{familySafetyDetail}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--hairline)] bg-white shadow-e2">
            <CardContent className="p-5 md:p-6">
              <p className="text-sm font-medium text-slate-500">现在该怎么做</p>
              <p className="mt-2 text-lg font-semibold leading-8 text-[#12211c]">{nextAction}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant={realtimeQualified ? "success" : "warning"}>{realtimeQualified ? "两只设备上传正常" : dualActive ? "两只设备有数据，正在追赶实时" : "等待两只设备实时数据"}</Badge>
                <Badge variant={hasUsableReading ? "success" : "outline"}>{hasUsableReading ? clinicalReady ? "本次结果可信" : "已有结果，可信度较低" : "数据不足，暂不判断"}</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-4 ${showProfessional ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2"}`} aria-label="本次训练完成情况">
          {[
            ...(showProfessional ? [
              { label: "本次活动范围", value: metrics?.rom.value, suffix: "°", note: clinicalReady ? "已通过质量核对" : "同步实测预览，可信度较低" },
              { label: "最深弯曲角度", value: metrics?.rom.peakFlexion, suffix: "°", note: `训练目标 ${metrics?.rom.targetFlexion ?? "--"}°；仅供护士复核` },
            ] : []),
            { label: showProfessional ? "完成完整屈伸" : "已完成动作", value: metrics?.training.repetitions, suffix: " 次", note: "弯曲后回到起始位置才计一次" },
            { label: showProfessional ? "实际训练时间" : "已经活动", value: metrics?.training.activeDurationSeconds, suffix: " 秒", note: "静止和断开期间不会计入" },
          ].map((item) => (
            <Card key={item.label} className="border-[var(--hairline)] bg-white shadow-e2">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-[#12211c]">
                  {typeof item.value === "number" ? formatNumber(item.value, Number.isInteger(item.value) ? 0 : 1) : "--"}
                  <span className="ml-1 text-sm text-slate-500">{item.suffix}</span>
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {!showProfessional ? (
          <button type="button" onClick={() => setShowProfessional(true)} className="flex w-full items-center justify-between rounded-lg border border-[var(--hairline)] bg-white px-5 py-4 text-left shadow-e1 hover:bg-slate-50">
            <span>
              <b className="block text-[#12211c]">查看专业详情</b>
              <span className="mt-1 block text-sm text-slate-500">包含数据一致性、3D 姿态、原始传感器数值、质量门和公式</span>
            </span>
            <BrainCircuit className="size-5 text-emerald-700" />
          </button>
        ) : null}

        {showProfessional ? <>
        <section className="border border-[var(--hairline)] bg-white px-4 py-2 shadow-e1 md:px-6" aria-labelledby="provenance-title">
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <Fingerprint className="size-4" />
                实时链路凭证
              </p>
              <h2 id="provenance-title" className="mt-1 text-xl font-medium text-[#12211c]">App、服务器与网页是否为同一帧</h2>
            </div>
            <Badge variant={realtimeQualified ? "success" : "warning"} className="w-fit px-3 py-1 text-sm">
              {realtimeQualified ? "双传感器实时达标" : "等待双传感器 2 秒内回执"}
            </Badge>
          </div>
          <ProvenanceRow placement="THIGH" sample={thighSample} nowMs={nowMs} />
          <ProvenanceRow placement="SHANK" sample={shankSample} nowMs={nowMs} />
          <p className="border-t border-slate-200 py-3 text-xs leading-5 text-slate-500">
            完整性规则：服务器按唯一样本 ID 接收，并把序号与 9 个 Acc / Gyro / Angle 数值原样回传；App 校验全部一致后才删除本地队列。网络或手机时钟异常会在这里直接显示，不会被算作实时。
          </p>
        </section>

        <SensorAttitudeScene thigh={thighSample} shank={shankSample} />

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="min-w-0 border-[var(--hairline)] bg-white shadow-e2">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">传感器模式</p>
              <p className="text-2xl font-semibold text-[#12211c]">{modeLabel(live?.mode, dualActive)}</p>
              <p className="text-xs text-slate-500">{dualActive ? "大腿+小腿均有帧" : "当前按单传感器处理"}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--hairline)] bg-white shadow-e2">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">最新膝角</p>
              <p className="text-2xl font-semibold text-[#12211c]">{formatNumber(latest?.flexionAngle)}°</p>
              <p className="text-xs text-slate-500">
                网关预览置信度 {formatNumber(typeof latest?.confidence === "number" ? latest.confidence * 100 : null, 0)}%
                {latest?.clinicalEligible ? " · 双路预览" : " · 仅原始"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-[var(--hairline)] bg-white shadow-e2">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">缓存样本</p>
              <p className="text-2xl font-semibold text-[#12211c]">{live?.sampleCount ?? 0}</p>
              <p className="text-xs text-slate-500">来源 {sourceLabels[latest?.source ?? ""] ?? "等待上传"}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--hairline)] bg-white shadow-e2">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">10 秒聚合点</p>
              <p className="text-2xl font-semibold text-[#12211c]">{live?.clinicalRecords.length ?? 0}</p>
              <p className="text-xs text-slate-500">{clinicalReady ? "当前质量门已通过" : "当前质量门未通过"}</p>
            </CardContent>
          </Card>
        </div>

        {!clinicalReady ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <p>
              当前质量门未通过。网站仍保留 Acc/Gyro/Angle、3D 和同帧凭证用于排查，但不会输出活动范围、训练次数或关注优先级。需要真实硬件、匹配的 GOOD 校准、200ms 内双路配对、连续采样和至少一次完整屈伸。
            </p>
          </div>
        ) : null}

        <section className="space-y-4" aria-labelledby="rehab-metrics-title">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">实时评估引擎</p>
              <h2 id="rehab-metrics-title" className="mt-1 text-2xl font-medium text-[#12211c]">训练测量、质量门与复核提示</h2>
            </div>
            {metrics ? (
              <div className="flex items-center gap-2">
                <Badge variant={metrics.provenance === "HARDWARE" ? "success" : "warning"}>
                  {metrics.provenance === "HARDWARE" ? "真实硬件数据" : metrics.provenance === "DEMO" ? "演示数据" : "混合/未知来源"}
                </Badge>
                <Badge variant={riskVariant(metrics.risk.level)}>{riskLabel(metrics.risk.level)}</Badge>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "活动范围（ROM）", value: metrics?.rom.value, suffix: "°", note: "P95 - P05", icon: Calculator },
              { label: "峰值屈曲", value: metrics?.rom.peakFlexion, suffix: "°", note: `目标 ${metrics?.rom.targetFlexion ?? "--"}°`, icon: Gauge },
              { label: "距完全伸直", value: metrics?.rom.extensionDeficit, suffix: "°", note: "校准后越接近 0 越好", icon: Activity },
              { label: "完整屈伸", value: metrics?.training.repetitions, suffix: " 次", note: `${formatNumber(metrics?.training.cadencePerMinute)} 次/分`, icon: RefreshCw },
              { label: "有效活动", value: metrics?.training.activeDurationSeconds, suffix: " 秒", note: "排除静止与长断帧", icon: Timer },
              { label: "数据质量", value: metrics?.dataQuality.score, suffix: " 分", note: `${metrics?.dataQuality.synchronizedPairs ?? 0} 对同步帧`, icon: ShieldCheck },
            ].map((item) => (
              <Card key={item.label} className="border-[var(--hairline)] bg-white shadow-e2">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <item.icon className="size-4 text-emerald-700" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-[#12211c]">
                    {typeof item.value === "number" ? formatNumber(item.value, Number.isInteger(item.value) ? 0 : 1) : "--"}
                    <span className="ml-1 text-sm font-medium text-slate-500">{item.suffix}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{item.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-[var(--hairline)] bg-white shadow-e2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <ShieldCheck className="size-5 text-emerald-700" />
                测量质量诊断
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {[
                  ["同步帧对", `${metrics?.dataQuality.synchronizedPairs ?? 0} 对`],
                  ["P95 配对误差", formatLatency(metrics?.dataQuality.pairGapP95Ms)],
                  ["连续观察", `${formatNumber(metrics?.dataQuality.observationSeconds)} 秒`],
                  ["采样连续性", `${formatNumber(metrics?.dataQuality.samplingRegularityPercent, 0)}%`],
                  ["动作合理性", `${formatNumber(metrics?.dataQuality.motionPlausibilityPercent, 0)}%`],
                  ["校准匹配", metrics?.dataQuality.calibrationStatus ?? "--"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-3 py-3">
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-[#12211c]">{value}</p>
                  </div>
                ))}
              </div>
              {(metrics?.dataQuality.reasonCodes.length ?? 0) > 0 ? (
                <p className="mt-3 break-words rounded-lg bg-amber-50 px-3 py-2 font-mono text-xs leading-5 text-amber-900">
                  暂不生成训练结论：{metrics?.dataQuality.reasonCodes.map(qualityReasonLabel).join("；")}
                </p>
              ) : <p className="mt-3 text-sm font-semibold text-emerald-700">全部质量门已通过。</p>}
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-[var(--hairline)] bg-white shadow-e2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                  <ShieldAlert className="size-5 text-amber-700" />
                  关注优先级计算链路
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="border-l-4 border-[#2f6076] bg-[#fdfbf7] px-4 py-3">
                  <p className="text-xs font-medium text-[#2f6076]">1 · 基础输入</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    同步帧 {metrics?.dataQuality.synchronizedPairs ?? 0} 对；P95 屈曲 {formatNumber(metrics?.rom.peakFlexion)}°；P05 {formatNumber(metrics?.rom.minimumFlexion)}°；近期趋势 {formatNumber(metrics?.trend.changeDegrees)}°；疼痛只读取最近一次人工填写记录。
                  </p>
                </div>
                <div className={`border-l-4 px-4 py-3 ${metrics?.clinicalEligible ? "border-emerald-600 bg-emerald-50" : "border-amber-500 bg-amber-50"}`}>
                  <p className="text-xs font-medium text-slate-700">2 · 质量门</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    Q={metrics?.dataQuality.score ?? 0}；同时检查真实来源、校准设备、200ms 配对、观察时长、连续性、动作合理性和完整周期。{metrics?.clinicalEligible ? "已通过，可以继续计算。" : "任一条件未通过，关注优先级保持为空。"}
                  </p>
                </div>
                <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-900">3 · 风险加分</p>
                  {(metrics?.risk.factors.length ?? 0) > 0 ? metrics?.risk.factors.map((factor) => (
                    <div key={factor.name} className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700">{factor.name}：{factor.evidence}</span>
                      <span className="shrink-0 font-mono font-medium text-amber-800">+{factor.points}</span>
                    </div>
                  )) : <p className="mt-1 text-sm text-slate-600">{metrics?.clinicalEligible ? "没有加分项。" : "等待质量门通过。"}</p>}
                </div>
                <div className="flex items-end justify-between gap-4 border-l-4 border-[#12211c] bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-[#12211c]">4 · 复核优先级与动作</p>
                    <p className="mt-1 text-4xl font-semibold tabular-nums text-[#12211c]">
                      {typeof metrics?.risk.score === "number" ? metrics.risk.score : "--"}
                      <span className="ml-1 text-base text-slate-400">/100</span>
                    </p>
                  </div>
                  <Badge variant={metrics ? riskVariant(metrics.risk.level) : "outline"} className="px-3 py-1">
                    {metrics ? riskLabel(metrics.risk.level) : "等待计算"}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-slate-500">该分数只是“先看谁”的复核优先级，不是并发症概率或医学严重程度；任何提示都必须结合患者主诉与人工确认。</p>
              </CardContent>
            </Card>

            <Card className="border-[var(--hairline)] bg-white shadow-e2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                  <AlertTriangle className="size-5 text-red-600" />
                  当前预警
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(metrics?.warnings.length ?? 0) > 0 ? metrics?.warnings.map((warning) => (
                  <div key={warning.code} className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-amber-950">{warning.title}</p>
                      <Badge variant={warning.severity === "HIGH" ? "destructive" : "warning"}>{warning.severity}</Badge>
                      {warning.requiresHumanConfirmation ? <Badge variant="outline">需人工确认</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-amber-950">{warning.evidence}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">处置：{warning.action}</p>
                  </div>
                )) : !metrics?.clinicalEligible ? (
                  <div className="flex min-h-36 flex-col items-center justify-center text-center">
                    <ShieldAlert className="size-8 text-amber-700" />
                    <p className="mt-3 font-medium text-[#12211c]">暂时无法判断</p>
                    <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">当前测量质量不足，因此系统不会显示“无异常”。请先完成设备连接、校准和一次完整屈伸。</p>
                  </div>
                ) : (
                  <div className="flex min-h-36 flex-col items-center justify-center text-center">
                    <ShieldCheck className="size-8 text-emerald-700" />
                    <p className="mt-3 font-medium text-[#12211c]">本次监测未发现明显异常</p>
                    <p className="mt-1 text-sm text-slate-500">仍需结合家人感受和护士评估；明显疼痛或肿胀时请暂停。</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 border-[var(--hairline)] bg-white shadow-e2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <Calculator className="size-5 text-emerald-700" />
                公式与安全边界
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm leading-6 lg:grid-cols-2">
              <div className="space-y-3">
                {[metrics?.rom.formula, metrics?.training.formula, metrics?.trend.formula, metrics?.risk.formula]
                  .filter(Boolean)
                  .map((formula) => <p key={formula} className="border-l-2 border-emerald-600 pl-3 text-slate-700">{formula}</p>)}
              </div>
              <div className="space-y-2 bg-slate-50 p-4">
                {(metrics?.safetyBoundary ?? ["等待评估引擎返回数据边界。"]).map((boundary) => (
                  <p key={boundary} className="flex gap-2 text-slate-600">
                    <span className="font-medium text-amber-700">•</span>
                    <span>{boundary}</span>
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <SensorCard placement="THIGH" sample={live?.latestByPlacement?.THIGH} />
          <SensorCard placement="SHANK" sample={live?.latestByPlacement?.SHANK} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="min-w-0 border-[var(--hairline)] bg-white shadow-e2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <Gauge className="size-5 text-emerald-700" />
                原始样本波形（近 30 帧）
              </CardTitle>
            </CardHeader>
            <CardContent className="relative h-72 min-w-0">
              {waveform.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  {loading ? "加载中…" : "等待 Android 网关上传 HARDWARE 样本"}
                </div>
              ) : (
                <div className="absolute inset-0 pt-1"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={waveform}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f2ebdf" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="flexion" name="膝角°" stroke="#2f6076" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="pitch" name="Pitch°" stroke="#2f7d5c" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="roll" name="Roll°" stroke="#E87BA4" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer></div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 border-[var(--hairline)] bg-white shadow-e2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <Activity className="size-5 text-emerald-700" />
                临床趋势（10 秒聚合）
              </CardTitle>
            </CardHeader>
            <CardContent className="relative h-72 min-w-0">
              {clinicalSeries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                  <AlertTriangle className="size-5 text-amber-600" />
                  尚无临床聚合点。单传感器 confidence=0.35 只保留原始帧。
                </div>
              ) : (
                <div className="absolute inset-0 pt-1"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={clinicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f2ebdf" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={20} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 150]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="flexion" name="临床屈曲°" stroke="#12211c" strokeWidth={2.5} dot />
                  </LineChart>
                </ResponsiveContainer></div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[var(--hairline)] bg-white shadow-e2">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <BrainCircuit className="size-5 text-emerald-700" />
                内置分析 API
              </CardTitle>
              <p className="mt-2 text-sm text-slate-500">仅在双传感器质量门通过后生成康复分析。</p>
            </div>
            <Button disabled={!patientId || analyzing || !clinicalReady} onClick={runAnalysis}>
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
              {analyzing ? "正在分析" : "运行分析"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              调用 <code className="rounded bg-slate-100 px-1.5 py-0.5">POST /api/ai-analyses</code>
              ，优先使用 HARDWARE 临床记录；无密钥时回退本地规则。分析结果会标明数据来源与可信边界。
            </p>
            {analysis ? (
              <div className="space-y-3 rounded-2xl border border-[rgba(60,101,82,0.16)] bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{analysis.provider}</Badge>
                  <span className="text-sm text-slate-500">{formatClock(analysis.createdAt)}</span>
                  <span className="text-sm font-semibold text-slate-700">
                    屈曲 {analysis.flexionAngle.toFixed(0)}° · 疼痛 {analysis.painScore}/10
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#12211c]">评估</p>
                  <p className="mt-1 text-sm leading-7 text-slate-700">{analysis.report}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#12211c]">建议</p>
                  <p className="mt-1 text-sm leading-7 text-slate-700">{analysis.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">尚未生成分析。有临床趋势后点击“运行内置分析”。</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--hairline)] bg-white shadow-e2">
          <CardHeader>
            <CardTitle className="text-xl text-[#12211c]">最近原始帧</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">时间</th>
                  <th className="px-2 py-2">App 样本</th>
                  <th className="px-2 py-2">位置</th>
                  <th className="px-2 py-2">来源</th>
                  <th className="px-2 py-2">Acc XYZ</th>
                  <th className="px-2 py-2">Gyro XYZ</th>
                  <th className="px-2 py-2">Angle R/P/Y</th>
                  <th className="px-2 py-2">膝角</th>
                  <th className="px-2 py-2">置信</th>
                  <th className="px-2 py-2">模式</th>
                </tr>
              </thead>
              <tbody>
                {(live?.samples ?? []).slice(0, 12).map((sample) => (
                  <tr key={sample.id} className="border-b border-slate-100 font-mono text-[12px]">
                    <td className="px-2 py-2">{formatClock(sample.recordedAt)}</td>
                    <td className="px-2 py-2">#{sample.captureSequence ?? "--"} / …{sample.gatewaySampleId?.slice(-8) ?? "--------"}</td>
                    <td className="px-2 py-2">{placementLabels[sample.placement]}</td>
                    <td className="px-2 py-2">{sourceLabels[sample.source] ?? sample.source}</td>
                    <td className="px-2 py-2">
                      {formatNumber(sample.ax)}/{formatNumber(sample.ay)}/{formatNumber(sample.az)}
                    </td>
                    <td className="px-2 py-2">
                      {formatNumber(sample.gx)}/{formatNumber(sample.gy)}/{formatNumber(sample.gz)}
                    </td>
                    <td className="px-2 py-2">
                      {formatNumber(sample.roll)}/{formatNumber(sample.pitch)}/{formatNumber(sample.yaw)}
                    </td>
                    <td className="px-2 py-2">{formatNumber(sample.flexionAngle)}</td>
                    <td className="px-2 py-2">{formatNumber(sample.confidence, 2)}</td>
                    <td className="px-2 py-2">{sample.kneeAngleMode ?? "--"}</td>
                  </tr>
                ))}
                {(live?.samples.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-8 text-center text-slate-500">
                      暂无原始帧。手机连接传感器后点“开始采集上传”。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
        </> : null}
      </section>
    </main>
  );
}
