"use client";

import Link from "next/link";
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
          <p className="font-bold text-[#12304a]">{placementLabels[placement]}</p>
          <p className="text-xs text-slate-500">样本 #{sample?.captureSequence ?? "--"}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">App / 网页共同样本 ID</p>
        <p className="mt-1 font-mono text-sm font-bold text-slate-800">…{shortId}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">手机采集 → 服务器</p>
        <p className="mt-1 font-mono font-bold text-slate-800">{formatLatency(sample?.ingestLatencyMs)}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">采集 → 当前网页</p>
        <p className={`mt-1 font-mono font-bold ${trusted ? "text-emerald-700" : "text-amber-800"}`}>
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
    <div className="rounded-2xl border border-[#d9e2e9] bg-[#f7fafb] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[#647889]">
        {title}
        <span className="ml-1 font-medium normal-case text-slate-400">({unit})</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ["X", x],
          ["Y", y],
          ["Z", z],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-white px-2 py-2 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-400">{label}</p>
            <p className="mt-1 font-mono text-lg font-black tabular-nums text-[#12304a]">
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
    <Card className="border-[#d9e2e9] bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
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
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("康复患者");
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<"CONNECTING" | "LIVE" | "FALLBACK">("CONNECTING");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestInFlight = useRef(false);

  const loadLive = useCallback(async (id: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const response = await fetch(`/api/sensor-samples?patientId=${encodeURIComponent(id)}&limit=80`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("实时样本读取失败");
      }
      const snapshot = (await response.json()) as LiveSnapshot;
      setLive(snapshot);
      const observedAt = new Date().toISOString();
      setLastRefresh(observedAt);
      setNowMs(new Date(observedAt).getTime());
    } finally {
      requestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const dashboardResponse = await fetch("/api/dashboard", { cache: "no-store" });
        const dashboard = (await dashboardResponse.json()) as DashboardData;
        const patient = dashboard.patients[0];
        if (!patient) {
          throw new Error("没有可监测的患者档案");
        }
        if (cancelled) return;

        setPatientId(patient.id);
        setPatientName(patient.name);
        setAnalysis(dashboard.aiAnalyses.filter((item) => item.patientId === patient.id).at(-1) ?? null);
        await loadLive(patient.id);

        eventSource = new EventSource(`/api/sensor-samples/stream?patientId=${encodeURIComponent(patient.id)}`);
        eventSource.onopen = () => setStreamState("LIVE");
        eventSource.addEventListener("sample", () => {
          void loadLive(patient.id).catch(() => setStreamState("FALLBACK"));
        });
        eventSource.onerror = () => setStreamState("FALLBACK");

        timer = setInterval(() => {
          void loadLive(patient.id).catch(() => {
            // Keep last good frame; next tick retries.
          });
        }, 1000);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "实时看板加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      eventSource?.close();
    };
  }, [loadLive]);

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
      setMessage(`分析完成（${payload.provider}），基于临床趋势记录，不含单传感器临时读数。`);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  const latest = live?.latest ?? null;
  const dualActive = Boolean(live?.dualActive);
  const clinicalReady = (live?.clinicalRecords.length ?? 0) > 0;
  const metrics = live?.metrics ?? null;
  const thighSample = live?.latestByPlacement?.THIGH;
  const shankSample = live?.latestByPlacement?.SHANK;
  const realtimeQualified = isTrustedRealtimeSample(thighSample, nowMs)
    && isTrustedRealtimeSample(shankSample, nowMs);

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-lg border border-[#d9e2e9] bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
                <Activity className="size-4" />
                实时传感器看板
              </Badge>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#12304a] md:text-4xl">
                手机与网页同帧实时监测
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                每帧都带有 App 采样 ID、设备内序号和服务器回执。只有来源为真实硬件、数值校验一致且端到端时间不超过 2 秒，才显示“实时达标”。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                患者 {patientName}
                {patientId ? ` · ${patientId}` : ""} · 网页观测 {formatClock(lastRefresh)} · {streamState === "LIVE" ? "事件流在线" : streamState === "FALLBACK" ? "轮询兜底" : "正在连接事件流"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                variant="elder"
                disabled={!patientId || loading}
                onClick={() => patientId && void loadLive(patientId)}
              >
                <RefreshCw className="size-5" />
                立即刷新
              </Button>
              <Button size="lg" variant="outline" disabled={!patientId || analyzing} onClick={runAnalysis}>
                {analyzing ? <Loader2 className="size-5 animate-spin" /> : <BrainCircuit className="size-5" />}
                运行内置分析
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/family/devices">设备绑定</Link>
              </Button>
            </div>
          </div>
        </header>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {message ? <StatusNotice tone="success">{message}</StatusNotice> : null}

        <section className="border border-[#d9e2e9] bg-white px-4 py-2 shadow-sm md:px-6" aria-labelledby="provenance-title">
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <Fingerprint className="size-4" />
                实时链路凭证
              </p>
              <h2 id="provenance-title" className="mt-1 text-xl font-bold text-[#12304a]">App、服务器与网页是否为同一帧</h2>
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
          <Card className="min-w-0 border-[#d9e2e9] bg-white shadow-sm">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">传感器模式</p>
              <p className="text-2xl font-black text-[#12304a]">{modeLabel(live?.mode, dualActive)}</p>
              <p className="text-xs text-slate-500">{dualActive ? "大腿+小腿均有帧" : "当前按单传感器处理"}</p>
            </CardContent>
          </Card>
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">最新膝角</p>
              <p className="text-2xl font-black text-[#12304a]">{formatNumber(latest?.flexionAngle)}°</p>
              <p className="text-xs text-slate-500">
                置信度 {formatNumber(typeof latest?.confidence === "number" ? latest.confidence * 100 : null, 0)}%
                {latest?.clinicalEligible ? " · 可进临床" : " · 仅原始"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">缓存样本</p>
              <p className="text-2xl font-black text-[#12304a]">{live?.sampleCount ?? 0}</p>
              <p className="text-xs text-slate-500">来源 {sourceLabels[latest?.source ?? ""] ?? "等待上传"}</p>
            </CardContent>
          </Card>
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-500">临床趋势点</p>
              <p className="text-2xl font-black text-[#12304a]">{live?.clinicalRecords.length ?? 0}</p>
              <p className="text-xs text-slate-500">{clinicalReady ? "可供分析 API 使用" : "尚无高置信聚合"}</p>
            </CardContent>
          </Card>
        </div>

        {!clinicalReady ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <p>
              当前只有原始样本或低置信单传感器读数时，网站会显示 Acc/Gyro/Angle，但不会生成临床趋势或告警，内置分析也不会把这些临时值当结论。接上第二只传感器并完成双传感器校准后，可信膝角才会进入分析。
            </p>
          </div>
        ) : null}

        <section className="space-y-4" aria-labelledby="rehab-metrics-title">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-700">实时评估引擎</p>
              <h2 id="rehab-metrics-title" className="mt-1 text-2xl font-bold text-[#12304a]">ROM、训练质量与安全预警</h2>
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
              { label: "本次 ROM", value: metrics?.rom.value, suffix: "°", note: "P95 - P05", icon: Calculator },
              { label: "峰值屈曲", value: metrics?.rom.peakFlexion, suffix: "°", note: `目标 ${metrics?.rom.targetFlexion ?? "--"}°`, icon: Gauge },
              { label: "伸直缺失", value: metrics?.rom.extensionDeficit, suffix: "°", note: "越接近 0 越好", icon: Activity },
              { label: "完整重复", value: metrics?.training.repetitions, suffix: " 次", note: `${formatNumber(metrics?.training.cadencePerMinute)} 次/分`, icon: RefreshCw },
              { label: "有效活动", value: metrics?.training.activeDurationSeconds, suffix: " 秒", note: "排除静止与长断帧", icon: Timer },
              { label: "数据质量", value: metrics?.dataQuality.score, suffix: " 分", note: `${metrics?.dataQuality.eligibleSamples ?? 0} 个合格样本`, icon: ShieldCheck },
            ].map((item) => (
              <Card key={item.label} className="border-[#d9e2e9] bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <item.icon className="size-4 text-emerald-700" />
                  </div>
                  <p className="mt-3 text-2xl font-black tabular-nums text-[#12304a]">
                    {typeof item.value === "number" ? formatNumber(item.value, Number.isInteger(item.value) ? 0 : 1) : "--"}
                    <span className="ml-1 text-sm font-bold text-slate-500">{item.suffix}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{item.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-[#d9e2e9] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                  <ShieldAlert className="size-5 text-amber-700" />
                  风险计算链路
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="border-l-4 border-[#2b6f88] bg-[#f3f8fa] px-4 py-3">
                  <p className="text-xs font-bold text-[#2b6f88]">1 · 基础输入</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    双传感器合格样本 {metrics?.dataQuality.eligibleSamples ?? 0} 个；P95 屈曲 {formatNumber(metrics?.rom.peakFlexion)}°；P05 {formatNumber(metrics?.rom.minimumFlexion)}°；近期趋势 {formatNumber(metrics?.trend.changeDegrees)}°；疼痛来自最近一次人工记录。
                  </p>
                </div>
                <div className={`border-l-4 px-4 py-3 ${metrics?.clinicalEligible ? "border-emerald-600 bg-emerald-50" : "border-amber-500 bg-amber-50"}`}>
                  <p className="text-xs font-bold text-slate-700">2 · 质量门</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    Q={metrics?.dataQuality.score ?? 0}；要求至少 5 个双传感器样本且 Q≥55。{metrics?.clinicalEligible ? "已通过，可以继续计算。" : "未通过，风险分保持为空。"}
                  </p>
                </div>
                <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-bold text-amber-900">3 · 风险加分</p>
                  {(metrics?.risk.factors.length ?? 0) > 0 ? metrics?.risk.factors.map((factor) => (
                    <div key={factor.name} className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700">{factor.name}：{factor.evidence}</span>
                      <span className="shrink-0 font-mono font-bold text-amber-800">+{factor.points}</span>
                    </div>
                  )) : <p className="mt-1 text-sm text-slate-600">{metrics?.clinicalEligible ? "没有加分项。" : "等待质量门通过。"}</p>}
                </div>
                <div className="flex items-end justify-between gap-4 border-l-4 border-[#12304a] bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-[#12304a]">4 · 结果与动作</p>
                    <p className="mt-1 text-4xl font-black tabular-nums text-[#12304a]">
                      {typeof metrics?.risk.score === "number" ? metrics.risk.score : "--"}
                      <span className="ml-1 text-base text-slate-400">/100</span>
                    </p>
                  </div>
                  <Badge variant={metrics ? riskVariant(metrics.risk.level) : "outline"} className="px-3 py-1">
                    {metrics ? riskLabel(metrics.risk.level) : "等待计算"}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-slate-500">风险提示用于监测和分流，不是诊断；任何高风险项都必须结合患者主诉与人工确认。</p>
              </CardContent>
            </Card>

            <Card className="border-[#d9e2e9] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                  <AlertTriangle className="size-5 text-red-600" />
                  当前预警
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(metrics?.warnings.length ?? 0) > 0 ? metrics?.warnings.map((warning) => (
                  <div key={warning.code} className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-amber-950">{warning.title}</p>
                      <Badge variant={warning.severity === "HIGH" ? "destructive" : "warning"}>{warning.severity}</Badge>
                      {warning.requiresHumanConfirmation ? <Badge variant="outline">需人工确认</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-amber-950">{warning.evidence}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">处置：{warning.action}</p>
                  </div>
                )) : (
                  <div className="flex min-h-36 flex-col items-center justify-center text-center">
                    <ShieldCheck className="size-8 text-emerald-700" />
                    <p className="mt-3 font-bold text-[#12304a]">当前无规则预警</p>
                    <p className="mt-1 text-sm text-slate-500">仍需结合患者主诉和护士评估。</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
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
                    <span className="font-bold text-amber-700">•</span>
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
          <Card className="min-w-0 border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                <Gauge className="size-5 text-emerald-700" />
                原始样本波形（近 30 帧）
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 min-w-0">
              {waveform.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  {loading ? "加载中…" : "等待 Android 网关上传 HARDWARE 样本"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waveform}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="flexion" name="膝角°" stroke="#0f766e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pitch" name="Pitch°" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="roll" name="Roll°" stroke="#b45309" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                <Activity className="size-5 text-emerald-700" />
                临床趋势（10 秒聚合）
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 min-w-0">
              {clinicalSeries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                  <AlertTriangle className="size-5 text-amber-600" />
                  尚无临床聚合点。单传感器 confidence=0.35 只保留原始帧。
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={clinicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={20} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 150]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="flexion" name="临床屈曲°" stroke="#12304a" strokeWidth={2.5} dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#d9e2e9] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
              <BrainCircuit className="size-5 text-emerald-700" />
              内置分析 API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              调用 <code className="rounded bg-slate-100 px-1.5 py-0.5">POST /api/ai-analyses</code>
              ，优先使用 HARDWARE 临床记录；无密钥时回退本地规则。分析结果会标明数据来源与可信边界。
            </p>
            {analysis ? (
              <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-[#12304a] text-white">{analysis.provider}</Badge>
                  <span className="text-sm text-slate-500">{formatClock(analysis.createdAt)}</span>
                  <span className="text-sm font-semibold text-slate-700">
                    屈曲 {analysis.flexionAngle.toFixed(0)}° · 疼痛 {analysis.painScore}/10
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#12304a]">评估</p>
                  <p className="mt-1 text-sm leading-7 text-slate-700">{analysis.report}</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#12304a]">建议</p>
                  <p className="mt-1 text-sm leading-7 text-slate-700">{analysis.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">尚未生成分析。有临床趋势后点击“运行内置分析”。</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#d9e2e9] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl text-[#12304a]">最近原始帧</CardTitle>
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
      </section>
    </main>
  );
}
