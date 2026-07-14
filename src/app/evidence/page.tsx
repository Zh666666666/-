"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Upload,
  type LucideIcon,
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
import { Textarea } from "@/components/ui/textarea";
import {
  createReviewedEvidenceReport,
  isEvidenceLoopComplete,
  parseLocalEvidencePackage,
  summarizeEvidencePackage,
  type EvidenceReview,
  type LocalEvidencePackage,
} from "@/lib/evidence-package";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function reviewStorageKey(sessionId: string) {
  return `tka-evidence-review:${sessionId}`;
}

function loadReviews(sessionId: string): Record<string, EvidenceReview> {
  try {
    const raw = window.localStorage.getItem(reviewStorageKey(sessionId));
    return raw ? JSON.parse(raw) as Record<string, EvidenceReview> : {};
  } catch {
    return {};
  }
}

function saveReviews(sessionId: string, reviews: Record<string, EvidenceReview>) {
  window.localStorage.setItem(reviewStorageKey(sessionId), JSON.stringify(reviews));
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EvidencePage() {
  const [rawInput, setRawInput] = useState("");
  const [evidence, setEvidence] = useState<LocalEvidencePackage | null>(null);
  const [reviews, setReviews] = useState<Record<string, EvidenceReview>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => evidence ? summarizeEvidencePackage(evidence) : null, [evidence]);
  const loopComplete = evidence ? isEvidenceLoopComplete(evidence, reviews) : false;
  const chartData = useMemo(() => {
    if (!evidence) return [];
    const step = Math.max(1, Math.ceil(evidence.samples.length / 400));
    return evidence.samples.filter((_, index) => index % step === 0).map((sample) => ({
      time: new Intl.DateTimeFormat("zh-CN", { minute: "2-digit", second: "2-digit" }).format(new Date(sample.recordedAt)),
      roll: sample.roll,
      pitch: sample.pitch,
      yaw: sample.yaw,
    }));
  }, [evidence]);
  const metricCards: Array<{ label: string; value: number; unit: string; icon: LucideIcon }> = summary && evidence ? [
    { label: "任务时长", value: summary.durationSeconds, unit: "秒", icon: Activity },
    { label: "真实样本", value: summary.sampleCount, unit: "条", icon: FileCheck2 },
    { label: "实际采样率", value: summary.samplingRateHz, unit: "Hz", icon: Gauge },
    { label: "最大加速度", value: summary.maximumAccelerationG, unit: "g", icon: AlertTriangle },
    { label: "最大角速度", value: summary.maximumAngularVelocityDps, unit: "°/s", icon: Gauge },
    {
      label: "待处理事件",
      value: evidence.events.filter((event) => event.requiresAction && reviews[event.id]?.status !== "RESOLVED").length,
      unit: "项",
      icon: ShieldCheck,
    },
  ] : [];

  function acceptPackage(input: unknown) {
    try {
      const parsed = parseLocalEvidencePackage(input);
      setEvidence(parsed);
      setReviews(loadReviews(parsed.session.id));
      setNotes({});
      setError(null);
    } catch (parseError) {
      setEvidence(null);
      setError(parseError instanceof Error ? `证据包校验失败：${parseError.message}` : "证据包校验失败");
    }
  }

  function parseText() {
    try {
      acceptPackage(JSON.parse(rawInput));
    } catch {
      setError("JSON 格式无效，请确认文件完整且没有被截断。");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setRawInput(text);
    try {
      acceptPackage(JSON.parse(text));
    } catch {
      setError("无法读取该 JSON 文件。");
    }
  }

  function updateReview(eventId: string, status: EvidenceReview["status"]) {
    if (!evidence) return;
    const next = {
      ...reviews,
      [eventId]: {
        eventId,
        status,
        note: notes[eventId]?.trim() ?? reviews[eventId]?.note ?? "",
        updatedAt: new Date().toISOString(),
      },
    };
    setReviews(next);
    saveReviews(evidence.session.id, next);
  }

  function exportReview() {
    if (!evidence) return;
    downloadJson(
      `${evidence.session.id}-review.json`,
      createReviewedEvidenceReport(evidence, reviews),
    );
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="border border-[#d9e2e9] bg-white p-5 shadow-sm md:p-6">
          <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
            <FileCheck2 className="size-4" />
            无服务器证据闭环
          </Badge>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#12304a] md:text-4xl">真实硬件任务回放与事件处置</h1>
              <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                导入 Android 网关导出的加密任务证据副本，在本机浏览器回放姿态、核验采样质量、确认异常并导出处理报告。数据只在当前浏览器处理，不上传服务器。
              </p>
            </div>
            {evidence ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">HARDWARE</Badge>
                <Badge variant={loopComplete ? "success" : "warning"}>{loopComplete ? "闭环已完成" : "待完成处置"}</Badge>
              </div>
            ) : null}
          </div>
        </header>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]" aria-label="导入证据包">
          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12304a]">
                <Upload className="size-5 text-emerald-700" />
                选择 Android 证据包
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-[#b9cbd7] bg-[#f7fafb] px-4 text-center transition-colors hover:border-emerald-600">
                <Upload className="size-7 text-emerald-700" />
                <span className="mt-3 font-bold text-[#12304a]">打开 JSON 证据包</span>
                <span className="mt-1 text-xs text-slate-500">仅接受 tka-local-evidence/v1</span>
                <input
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void importFile(event.target.files?.[0])}
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">文件必须声明 HARDWARE 来源、BT50 型号，且样本/事件数量必须与清单一致。</p>
            </CardContent>
          </Card>

          <Card className="border-[#d9e2e9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl text-[#12304a]">粘贴 JSON</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                aria-label="证据包 JSON"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder="也可以在这里粘贴 Android 导出的完整 JSON"
                className="min-h-32 font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={parseText} disabled={!rawInput.trim()}>
                  <FileCheck2 className="size-4" />
                  校验证据包
                </Button>
                <Button variant="outline" onClick={() => { setRawInput(""); setEvidence(null); setError(null); }}>
                  <RotateCcw className="size-4" />
                  清空
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {!evidence || !summary ? (
          <div className="flex min-h-64 flex-col items-center justify-center border border-[#d9e2e9] bg-white px-5 text-center shadow-sm">
            <FileCheck2 className="size-10 text-slate-300" />
            <h2 className="mt-4 text-xl font-bold text-[#12304a]">等待真实任务证据包</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">在 Android 连接 BT50，开始并结束本地任务，然后点击“导出最近证据包”。</p>
          </div>
        ) : (
          <>
            <section className="space-y-4" aria-labelledby="evidence-summary-title">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-700">任务 {evidence.session.id}</p>
                  <h2 id="evidence-summary-title" className="mt-1 text-2xl font-bold text-[#12304a]">采集结果</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {evidence.session.sensorModel} · {evidence.session.appVersion} · {formatTime(evidence.session.startedAt)}
                  </p>
                </div>
                <Badge variant={evidence.session.status === "COMPLETED" ? "success" : "warning"}>{evidence.session.status}</Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {metricCards.map((item) => (
                  <Card key={item.label} className="border-[#d9e2e9] bg-white shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                        <item.icon className="size-4 text-emerald-700" />
                      </div>
                      <p className="mt-3 text-2xl font-black tabular-nums text-[#12304a]">
                        {item.value} <span className="text-sm text-slate-400">{item.unit}</span>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <Card className="border-[#d9e2e9] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#12304a]">单传感器姿态回放</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={28} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="roll" name="Roll°" stroke="#0f766e" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="pitch" name="Pitch°" stroke="#1d4ed8" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="yaw" name="Yaw°" stroke="#b45309" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <section className="space-y-3" aria-labelledby="event-review-title">
              <div>
                <p className="text-sm font-bold text-emerald-700">处理闭环</p>
                <h2 id="event-review-title" className="mt-1 text-2xl font-bold text-[#12304a]">异常事件确认</h2>
              </div>
              {evidence.events.map((event) => {
                const review = reviews[event.id];
                const status = review?.status ?? event.status;
                return (
                  <Card key={event.id} className="border-[#d9e2e9] bg-white shadow-sm">
                    <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_0.8fr]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={event.severity === "HIGH" ? "destructive" : event.severity === "WATCH" ? "warning" : "outline"}>{event.severity}</Badge>
                          <Badge variant={status === "RESOLVED" ? "success" : "outline"}>{status}</Badge>
                          {event.requiresAction ? <Badge variant="warning">需要处理</Badge> : null}
                        </div>
                        <h3 className="mt-3 text-lg font-bold text-[#12304a]">{event.title}</h3>
                        <p className="mt-1 text-sm text-slate-500">{formatTime(event.occurredAt)} · {event.type}</p>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{event.evidence}</p>
                      </div>
                      <div className="space-y-3">
                        <Textarea
                          aria-label={`${event.title}处理说明`}
                          value={notes[event.id] ?? review?.note ?? ""}
                          onChange={(change) => setNotes((current) => ({ ...current, [event.id]: change.target.value }))}
                          placeholder="填写核验结果或处理说明"
                          className="min-h-24"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => updateReview(event.id, "ACKNOWLEDGED")}>确认收到</Button>
                          <Button onClick={() => updateReview(event.id, "RESOLVED")} disabled={event.requiresAction && !(notes[event.id]?.trim() || review?.note?.trim())}>
                            <CheckCircle2 className="size-4" />
                            标记已处理
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <section className={`border px-5 py-5 shadow-sm ${loopComplete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {loopComplete ? <ShieldCheck className="size-6 text-emerald-700" /> : <AlertTriangle className="size-6 text-amber-700" />}
                    <h2 className="text-xl font-bold text-[#12304a]">{loopComplete ? "本次任务闭环完成" : "仍有事件待处理"}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {loopComplete ? "任务已正常结束，所有需处理事件均有处理记录。" : "完成所有需处理事件并填写说明后，才能生成闭环完成状态。"}
                  </p>
                </div>
                <Button onClick={exportReview}>
                  <Download className="size-4" />
                  导出处理报告
                </Button>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
