"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, HeartHandshake, Radio, Settings2, XCircle } from "lucide-react";

import { StatusNotice } from "@/components/status-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import type { AppointmentItem, AppointmentStatus } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";

function toDatetimeLocal(value: string) {
  return value.slice(0, 16);
}

function statusLabel(status: AppointmentStatus) {
  return status === "PENDING" ? "待确认" : status === "CONFIRMED" ? "已确认" : "已拒绝";
}

const appointmentCareSteps = [
  "说清楚：哪里疼、什么时候肿、训练后有什么变化。",
  "不用怕打扰：拿不准的照护问题，本来就应该交给专业护士一起判断。",
  "等回复时：先暂停让家人明显不舒服的动作，保持电话畅通。",
];

function AppointmentManageDialog({ appointment, onSubmit }: { appointment: AppointmentItem; onSubmit: (id: string, status: AppointmentStatus, scheduledTime: string | null, responseNote: string) => Promise<void> }) {
  const [status, setStatus] = useState<AppointmentStatus>("CONFIRMED");
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal(new Date(Date.now() + 2 * 60 * 60_000).toISOString()));
  const [responseNote, setResponseNote] = useState("已安排骨科康复护士上门，请保持电话畅通。我们会先听家属描述，再查看膝关节肿胀、疼痛、步态和训练记录，一起把后续照护节奏定下来。");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onSubmit(appointment.id, status, scheduledTime, responseNote);
    setSaving(false);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="elder"><Settings2 className="size-5" />处理预约</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <Badge variant="warning" className="w-fit">待确认预约</Badge>
          <DialogTitle>{appointment.patientName} 上门护理安排</DialogTitle>
          <DialogDescription>{appointment.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Button variant={status === "CONFIRMED" ? "elder" : "outline"} onClick={() => setStatus("CONFIRMED")}><CheckCircle2 className="size-5" />确认并安排</Button>
            <Button variant={status === "REJECTED" ? "destructive" : "outline"} onClick={() => setStatus("REJECTED")}><XCircle className="size-5" />拒绝预约</Button>
          </div>
          {status === "CONFIRMED" ? <Input type="datetime-local" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /> : null}
          <Textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder="填写护士回复" />
          <Button size="lg" variant="elder" onClick={submit} disabled={saving}>{saving ? "正在保存" : "保存处理结果"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppointmentsPage() {
  const [role, setRole] = useState<UserRole>("family");
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [syncMode, setSyncMode] = useState<"realtime" | "polling" | "connecting">("connecting");
  const [patientName, setPatientName] = useState("王桂兰");
  const [patientPhone, setPatientPhone] = useState("13800000001");
  const [expectedTime, setExpectedTime] = useState(toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60_000).toISOString()));
  const [description, setDescription] = useState("家人最近训练后膝关节有些肿胀，也担心自己练得不对。希望护士上门评估屈膝角度、疼痛、步态和居家照护方式，并教家属如何陪练更安心。");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  async function loadAppointments() {
    const response = await fetch("/api/appointments", { cache: "no-store" });
    setAppointments(await response.json());
  }

  useEffect(() => {
    async function loadRole() {
      const response = await fetch("/api/auth/role", { cache: "no-store" });
      const data = (await response.json()) as { role: UserRole | null };
      setRole(data.role ?? "family");
    }

    loadRole();
    loadAppointments();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSyncMode("polling");
      const timer = window.setInterval(loadAppointments, 3500);
      return () => window.clearInterval(timer);
    }

    const channel = subscribeToSharedTables("appointments", loadAppointments, ["profiles", "appointments"], (status) => setSyncMode(status === "SUBSCRIBED" ? "realtime" : "connecting"));

    return () => {
      removeRealtimeChannel(channel);
    };
  }, []);

  async function submitAppointment() {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientName, patientPhone, expectedTime: new Date(expectedTime).toISOString(), description }),
    });

    if (response.ok) {
      await loadAppointments();
      setDescription("");
      setNotice({ tone: "success", message: "预约已提交，护士端会实时收到。您把担心说出来，就是在帮家人获得更稳妥的照护。" });
    } else {
      setNotice({ tone: "error", message: "预约提交失败，请稍后重试。" });
    }
  }

  async function updateAppointment(id: string, status: AppointmentStatus, scheduledTime: string | null, responseNote: string) {
    const response = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        nurseName: "刘护士",
        scheduledTime: status === "CONFIRMED" && scheduledTime ? new Date(scheduledTime).toISOString() : null,
        responseNote,
      }),
    });

    if (response.ok) {
      await loadAppointments();
      setNotice({ tone: "success", message: "预约处理结果已保存并同步。" });
    } else {
      setNotice({ tone: "error", message: "预约处理失败，请稍后重试。" });
    }
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-e2 md:rounded-2xl md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant={syncMode === "realtime" ? "success" : "warning"} className="gap-2 px-3 py-1 text-sm">
              <Radio className="size-4" />
              {syncMode === "realtime" ? "预约实时同步" : syncMode === "polling" ? "Demo 轮询同步" : "正在连接同步通道"}
            </Badge>
            <h1 className="display-md mt-4 text-2xl md:text-[2rem]">预约上门护理</h1>
            <p className="mt-3 text-base leading-7 text-slate-600 md:text-lg md:leading-8">当家属拿不准疼痛、肿胀、训练动作或照护方式时，可以直接把担心写下来。预约不是打扰，而是让护士更早介入、更稳妥地陪家人恢复。</p>
            <p className="mt-3 rounded-lg border border-[rgba(60,101,82,0.14)] bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">护士确认后会同步安排时间、上门重点和回复说明，让家属知道下一步该做什么、不该硬撑什么。</p>
          </div>
          <Button asChild size="lg" variant="outline">
            <Link href={role === "nurse" ? "/nurse" : "/family"}>返回工作台</Link>
          </Button>
        </header>

        {notice ? <StatusNotice tone={notice.tone}>{notice.message}</StatusNotice> : null}

        {role === "family" ? (
          <Card className="border-[var(--hairline)] bg-gradient-to-br from-brass-100 via-white to-sage-50">
            <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr] md:p-6">
              <div className="flex size-14 items-center justify-center rounded-xl bg-brass-200 text-brass-800">
                <HeartHandshake className="size-7" />
              </div>
              <div>
                <Badge variant="warning" className="w-fit">家属求助说明</Badge>
                <p className="mt-3 text-lg font-semibold text-slate-900">把“不放心”写清楚，本身就是重要的护理信息。</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {appointmentCareSteps.map((item) => (
                    <p key={item} className="rounded-2xl bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700 shadow-e1">{item}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {role === "family" ? (
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl"><CalendarClock className="size-7 text-emerald-700" />提交预约</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Input value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="家人姓名" />
              <Input value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} placeholder="家属联系电话" />
              <Input type="datetime-local" value={expectedTime} onChange={(event) => setExpectedTime(event.target.value)} />
              <div className="md:col-span-2">
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请写下家人哪里不舒服、家属最担心什么、希望护士重点看什么" />
              </div>
              <Button className="md:col-span-2" size="lg" variant="elder" onClick={submitAppointment}>提交预约</Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {appointments.map((appointment) => (
            <Card key={appointment.id} className="bg-white/90">
              <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={appointment.status === "PENDING" ? "warning" : appointment.status === "CONFIRMED" ? "success" : "destructive"}>{statusLabel(appointment.status)}</Badge>
                    <span className="text-lg font-medium">{appointment.patientName}</span>
                    <span className="text-sm text-slate-500">期望：{new Date(appointment.expectedTime).toLocaleString("zh-CN")}</span>
                  </div>
                  <p className="mt-3 leading-7 text-slate-700">{appointment.description}</p>
                  {appointment.responseNote ? <p className="mt-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">护士回复：{appointment.responseNote}</p> : null}
                  {appointment.scheduledTime ? <p className="mt-2 text-sm font-semibold text-emerald-700">安排时间：{new Date(appointment.scheduledTime).toLocaleString("zh-CN")}</p> : null}
                </div>
                {role === "nurse" && appointment.status === "PENDING" ? (
                  <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                    <AppointmentManageDialog appointment={appointment} onSubmit={updateAppointment} />
                  </div>
                ) : (
                  <ClipboardList className="hidden size-8 text-slate-300 md:block" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
