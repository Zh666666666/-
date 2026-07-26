"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Database, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Summary = {
  status?: "NORMAL" | "NEEDS_ATTENTION" | "INSUFFICIENT_DATA";
  metrics?: {
    dataQuality: { score: number; synchronizedPairs: number; reasonCodes: string[] };
    rom: { value: number | null; peakFlexion: number | null };
    training: { repetitions: number | null; activeDurationSeconds: number | null };
    warnings: Array<{ title: string; evidence: string; action: string; code: string }>;
  };
};

type Session = {
  id: string;
  patientName: string;
  status: "COMPLETED" | "ABORTED";
  startedAt: string;
  endedAt: string | null;
  sampleCount: number;
  summary: Summary | null;
  analysis: { report?: string; recommendation?: string; confidence?: number; status?: string } | null;
};

const labels = {
  NORMAL: { text: "本次状态正常", className: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  NEEDS_ATTENTION: { text: "本次需要关注", className: "bg-amber-100 text-amber-900", icon: AlertTriangle },
  INSUFFICIENT_DATA: { text: "本次数据不足", className: "bg-slate-100 text-slate-700", icon: ShieldQuestion },
};

export function TrainingHistory({ role }: { role: "family" | "nurse" }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [professional, setProfessional] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sensor-sessions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="rehab-grid min-h-screen px-4 pb-28 pt-5 text-[#12211c] md:px-10">
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm"><Link href={role === "family" ? "/family" : "/nurse"}><ArrowLeft className="size-4" />返回工作台</Link></Button>
            <h1 className="display-md mt-3 text-2xl md:text-[1.75rem]">近 15 天训练记录</h1>
            <p className="mt-2 text-sm text-slate-600">摘要和异常证据保存 15 天；逐帧原始数据保存 72 小时后自动清理。</p>
          </div>
          <div className="inline-flex border border-slate-200 bg-white p-1">
            <Button size="sm" variant={!professional ? "default" : "ghost"} onClick={() => setProfessional(false)}>易懂结果</Button>
            <Button size="sm" variant={professional ? "default" : "ghost"} onClick={() => setProfessional(true)}>专业详情</Button>
          </div>
        </header>

        {loading ? <p className="bg-white p-8 text-center text-slate-500">正在读取训练记录...</p> : null}
        {!loading && sessions.length === 0 ? <div className="bg-white p-10 text-center"><Activity className="mx-auto size-9 text-slate-400" /><p className="mt-3 font-medium">还没有已结束的训练</p></div> : null}

        <div className="grid gap-4">
          {sessions.map((session) => {
            const state = session.summary?.status ?? "INSUFFICIENT_DATA";
            const presentation = labels[state];
            const Icon = presentation.icon;
            const metrics = session.summary?.metrics;
            const duration = session.endedAt ? Math.max(0, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)) : null;
            return (
              <article key={session.id} className="border border-slate-200 bg-white p-5 shadow-e1">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold ${presentation.className}`}><Icon className="size-4" />{presentation.text}</div>
                    <h2 className="mt-3 text-xl font-semibold">{session.patientName} · {new Date(session.startedAt).toLocaleString("zh-CN")}</h2>
                    <p className="mt-1 flex flex-wrap gap-4 text-sm text-slate-500"><span><Clock3 className="mr-1 inline size-4" />{duration ?? "--"} 秒</span><span><Database className="mr-1 inline size-4" />{session.sampleCount} 帧</span></p>
                  </div>
                  <Badge variant={session.status === "COMPLETED" ? "success" : "warning"}>{session.status === "COMPLETED" ? "已完成" : "已中止"}</Badge>
                </div>

                {!professional ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-500">系统怎么看</p>
                      <p className="mt-2 leading-7">{state === "INSUFFICIENT_DATA" ? "本次数据不够完整，暂时不能判断训练表现；这不代表身体出现异常。" : state === "NORMAL" ? "本次没有发现需要优先处理的问题。" : "本次发现需要家属或护士留意的情况。"}</p>
                    </div>
                    <div className="bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-500">接下来怎么做</p>
                      <p className="mt-2 leading-7">{state === "NEEDS_ATTENTION" ? "查看本次提示；若伴随疼痛、肿胀或跌倒，请联系护士。" : state === "INSUFFICIENT_DATA" ? "检查两只传感器是否连接、位置是否正确，再自然完成一次训练。" : "按原计划训练，并留意身体感受。"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ["活动范围", metrics?.rom.value, "°"],
                      ["最深弯曲", metrics?.rom.peakFlexion, "°"],
                      ["完整屈伸", metrics?.training.repetitions, " 次"],
                      ["有效时间", metrics?.training.activeDurationSeconds, " 秒"],
                      ["数据质量", metrics?.dataQuality.score, " 分"],
                    ].map(([label, value, suffix]) => <div key={String(label)} className="border-l-2 border-emerald-600 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{typeof value === "number" ? value : "--"}{suffix}</p></div>)}
                    {(metrics?.warnings ?? []).map((warning) => <div key={warning.code} className="sm:col-span-2 lg:col-span-5 border-l-4 border-amber-500 bg-amber-50 p-3"><p className="font-medium">{warning.title}</p><p className="mt-1 text-sm">{warning.evidence}</p><p className="mt-1 text-sm font-semibold">建议：{warning.action}</p></div>)}
                    {session.analysis ? <div className="sm:col-span-2 lg:col-span-5 border-l-2 border-slate-400 bg-slate-50 p-3"><p className="font-medium">智能解读 · {session.analysis.status ?? "待标注"}</p><p className="mt-1 text-sm">{session.analysis.report}</p><p className="mt-1 text-sm">建议：{session.analysis.recommendation}</p></div> : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
