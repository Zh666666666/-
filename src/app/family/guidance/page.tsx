"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCheck, Clock3, FileText, HeartHandshake, Radio, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import { formatTime, type DashboardData, type NursingRecordItem } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";

async function fetchGuidanceRecords() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Guidance request failed");
  }

  const dashboard = (await response.json()) as DashboardData;
  return dashboard.nursingRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function SoapBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-sky-700">{label}</p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value || "未填写"}</p>
    </div>
  );
}

const readingCareCards = [
  "读建议前，先告诉家人：护士看过数据了，我们不是自己瞎猜。",
  "做训练时，把目标拆小一点：先试一组，舒服再继续，不舒服就停下来。",
  "读完建议后，记下家人最担心的一句话，下次远程指导时直接告诉护士。",
];

export default function FamilyGuidancePage() {
  const [records, setRecords] = useState<NursingRecordItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [syncMode, setSyncMode] = useState<"realtime" | "polling" | "connecting">("connecting");

  async function refreshRecords() {
    setRecords(await fetchGuidanceRecords());
  }

  useEffect(() => {
    refreshRecords();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSyncMode("polling");
      const timer = window.setInterval(refreshRecords, 3500);
      return () => window.clearInterval(timer);
    }

    const channel = subscribeToSharedTables("family-guidance", refreshRecords, ["profiles", "nursing_records", "alert_logs"], (status) => setSyncMode(status === "SUBSCRIBED" ? "realtime" : "connecting"));
    const fallbackTimer = window.setInterval(refreshRecords, 12000);

    return () => {
      window.clearInterval(fallbackTimer);
      removeRealtimeChannel(channel);
    };
  }, []);

  const filteredRecords = records.filter((record) => {
    if (filter === "UNREAD") {
      return !record.readAt;
    }

    if (filter === "SOAP") {
      return Boolean(record.soap);
    }

    if (filter === "REMOTE_GUIDANCE" || filter === "REHAB_ADJUSTMENT" || filter === "HOME_VISIT") {
      return record.actionType === filter;
    }

    return true;
  });
  const unreadCount = records.filter((record) => !record.readAt).length;

  async function markRead(id: string) {
    const response = await fetch(`/api/nursing-records/${id}`, { method: "PATCH" });

    if (response.ok) {
      const record = (await response.json()) as NursingRecordItem;
      setRecords((current) => current.map((item) => (item.id === id ? record : item)));
    }
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-sm md:rounded-2xl md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant={syncMode === "realtime" ? "success" : "warning"} className="gap-2 px-3 py-1 text-sm">
              <Radio className="size-4" />
              {syncMode === "realtime" ? "指导建议实时同步" : syncMode === "polling" ? "Demo 轮询同步" : "正在连接同步通道"}
            </Badge>
            <h1 className="mt-4 font-display text-3xl font-medium tracking-tight md:text-5xl">远程指导建议</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 md:text-lg md:leading-8">护士端发送康复建议后会立即同步到这里。家属可以把它当成一张“安心照护单”：知道今天怎么练、什么时候停、哪些担心需要再问护士。</p>
          </div>
          <Button asChild size="lg" variant="outline">
            <Link href="/family">返回家属端</Link>
          </Button>
        </header>

        <Card className="border-rose-100 bg-gradient-to-br from-rose-50 via-white to-sky-50">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr] md:p-6">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-rose-100 text-rose-700">
              <HeartHandshake className="size-7" />
            </div>
            <div>
              <Badge variant="warning" className="w-fit">读给家人的照护话术</Badge>
              <p className="mt-3 text-lg font-semibold text-slate-900">护士建议不只是任务清单，也是一种安抚和陪伴。</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {readingCareCards.map((item) => (
                  <p key={item} className="rounded-2xl bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">{item}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-sky-100 bg-white/90">
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap gap-2">
              {[
                ["ALL", "全部"],
                ["UNREAD", `未读 ${unreadCount}`],
                ["SOAP", "SOAP"],
                ["REMOTE_GUIDANCE", "远程指导"],
                ["REHAB_ADJUSTMENT", "康复调整"],
                ["HOME_VISIT", "上门护理"],
              ].map(([value, label]) => (
                <Button key={value} size="sm" variant={filter === value ? "elder" : "outline"} className="min-w-[5.25rem]" onClick={() => setFilter(value)}>{label}</Button>
              ))}
            </div>
            <p className="text-sm font-semibold text-slate-500">共 {filteredRecords.length} 条匹配记录</p>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {filteredRecords.length === 0 ? (
            <Card className="bg-white/90">
              <CardContent className="p-8 text-center text-slate-500">暂无远程指导建议。当前可以先按日常训练节奏陪伴家人，若疼痛、肿胀或情绪焦虑明显，请提交预约护理让护士一起评估。</CardContent>
            </Card>
          ) : (
            filteredRecords.map((record) => (
              <Card key={record.id} className="bg-white/90">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3 text-2xl">
                      <FileText className="size-7 text-emerald-700" />
                      {record.readAt ? "已读指导" : "新的指导建议"}
                    </CardTitle>
                    <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1"><UserRound className="size-4" />{record.nurseName}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{formatTime(record.createdAt)}</span>
                    </p>
                  </div>
                  <Badge variant={record.readAt ? "success" : "destructive"}>{record.readAt ? "已读" : "未读"}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="rounded-3xl bg-emerald-50 p-5 text-lg leading-9 text-emerald-950">{record.guidance}</p>
                  <div className="rounded-3xl border border-rose-100 bg-rose-50/80 p-4 text-sm leading-7 text-rose-950">
                    <p className="font-semibold">家属陪伴提醒</p>
                    <p className="mt-1">如果家人听到训练建议后紧张，可以先说：“我们按护士说的慢慢来，疼了就停，不舒服马上告诉我。”</p>
                  </div>
                  {record.soap ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <SoapBlock label="S 主观资料" value={record.soap.subjective} />
                      <SoapBlock label="O 客观资料" value={record.soap.objective} />
                      <SoapBlock label="A 护理评估" value={record.soap.assessment} />
                      <SoapBlock label="P 护理计划" value={record.soap.plan} />
                    </div>
                  ) : null}
                  {record.notes ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 whitespace-pre-line text-slate-600">护理备注：{record.notes}</p> : null}
                  <Separator />
                  <div className="flex justify-end">
                    <Button variant={record.readAt ? "secondary" : "elder"} disabled={Boolean(record.readAt)} onClick={() => markRead(record.id)}>
                      <CheckCheck className="size-5" />
                      {record.readAt ? "已确认阅读" : "标记为已读"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
