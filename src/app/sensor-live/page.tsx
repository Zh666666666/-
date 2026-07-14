"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Gauge,
  Loader2,
  Radio,
  RefreshCw,
  ShieldAlert,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function modeLabel(mode: string | null | undefined, dualActive: boolean) {
  if (mode === "DUAL_SENSOR" || dualActive) return "双传感器可信";
  if (mode === "SINGLE_SENSOR_PROVISIONAL") return "单传感器临时";
  return "等待样本";
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
        <AxisGrid title="Acc" unit="g" x={sample?.ax} y={sample?.ay} z={sample?.az} />
        <AxisGrid title="Gyro" unit="°/s" x={sample?.gx} y={sample?.gy} z={sample?.gz} />
        <AxisGrid title="Angle" unit="°" x={sample?.roll} y={sample?.pitch} z={sample?.yaw} />
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

  const loadLive = useCallback(async (id: string) => {
    const response = await fetch(`/api/sensor-samples?patientId=${encodeURIComponent(id)}&limit=60`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("实时样本读取失败");
    }
    const snapshot = (await response.json()) as LiveSnapshot;
    setLive(snapshot);
    setLastRefresh(new Date().toISOString());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

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

        timer = setInterval(() => {
          void loadLive(patient.id).catch(() => {
            // Keep last good frame; next tick retries.
          });
        }, 1500);
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
    };
  }, [loadLive]);

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
                与 Android 网关同口径的实时读数
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                显示 Acc / Gyro / Angle、帧时间、来源与单/双传感器状态。原始样本实时刷新；临床趋势仅收录置信度≥0.7 的双传感器聚合。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                患者 {patientName}
                {patientId ? ` · ${patientId}` : ""} · 刷新 {formatClock(lastRefresh)}
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
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

        <div className="grid gap-5 xl:grid-cols-2">
          <SensorCard placement="THIGH" sample={live?.latestByPlacement?.THIGH} />
          <SensorCard placement="SHANK" sample={live?.latestByPlacement?.SHANK} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                <Gauge className="size-5 text-emerald-700" />
                原始样本波形（近 30 帧）
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
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

          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                <Activity className="size-5 text-emerald-700" />
                临床趋势（10 秒聚合）
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
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
                    <td colSpan={9} className="px-2 py-8 text-center text-slate-500">
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
