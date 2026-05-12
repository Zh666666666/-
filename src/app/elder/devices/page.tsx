"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlugZap, Radio, ShieldCheck, Smartphone, Unlink } from "lucide-react";

import { StatusNotice } from "@/components/status-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import type { ProfileItem } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";

type DeviceDraft = {
  deviceName: string;
  serialNo: string;
};

const defaultProfile = {
  role: "patient" as const,
  name: "演示患者",
  age: null,
  gender: "FEMALE" as const,
  tkaSurgeryDate: null,
  affectedKnee: "RIGHT" as const,
  phone: "",
  emergencyContact: "",
  sensorDeviceId: "",
  department: null,
  title: null,
};

function parseDevice(value: string | null): DeviceDraft {
  if (!value) {
    return { deviceName: "智能康复护膝", serialNo: "" };
  }

  const [deviceName, serialNo] = value.split(" · ");
  return {
    deviceName: deviceName || "智能康复护膝",
    serialNo: serialNo ?? value,
  };
}

export default function ElderDevicesPage() {
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [draft, setDraft] = useState<DeviceDraft>({ deviceName: "智能康复护膝", serialNo: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const response = await fetch("/api/profile?role=patient", { cache: "no-store" });
      const data = (await response.json()) as ProfileItem | null;

      if (!cancelled && data) {
        setProfile(data);
        setDraft(parseDevice(data.sensorDeviceId));
      }
    }

    loadProfile();

    if (!supabase) {
      const timer = window.setInterval(loadProfile, 3500);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }

    const channel = subscribeToSharedTables("elder-devices", loadProfile, ["profiles", "knee_data_records"]);

    return () => {
      cancelled = true;
      removeRealtimeChannel(channel);
    };
  }, []);

  async function saveDevice(sensorDeviceId: string | null) {
    const payload = {
      ...(profile ?? defaultProfile),
      role: "patient" as const,
      name: profile?.name || defaultProfile.name,
      sensorDeviceId,
    };
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Device save failed");
    }

    const data = (await response.json()) as ProfileItem;
    setProfile(data);
    setDraft(parseDevice(data.sensorDeviceId));
    return data;
  }

  async function bindDevice() {
    if (!draft.deviceName.trim() || !draft.serialNo.trim()) {
      setError("请填写设备名称和设备 ID/序列号。");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await saveDevice(`${draft.deviceName.trim()} · ${draft.serialNo.trim()}`);
      setSaved(true);
    } catch {
      setError("设备绑定失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function unbindDevice() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await saveDevice(null);
      setDraft({ deviceName: "智能康复护膝", serialNo: "" });
      setSaved(true);
    } catch {
      setError("设备解绑失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function checkDevice() {
    setChecking(true);
    setCheckResult(null);
    window.setTimeout(() => {
      setChecking(false);
      setCheckResult(profile?.sensorDeviceId ? "连接自检完成：电量 92%，信号稳定，采集频率正常。" : "尚未绑定设备，请先完成设备绑定。");
    }, 700);
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-5xl space-y-5 md:space-y-6">
        <header className="overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_28rem),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.9))] p-5 shadow-sm md:rounded-[2rem] md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
                <Radio className="size-4" />
                传感器设备绑定
              </Badge>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">添加智能护膝设备</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 md:text-lg md:leading-8">输入设备名称和设备 ID/序列号后绑定到患者档案，后续模拟上传会继续沿用当前患者身份。</p>
            </div>
            <Button asChild size="lg" variant="outline">
              <Link href="/elder">返回老人端</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <Card className="bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Smartphone className="size-7 text-emerald-700" />
                手动绑定设备
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-600">设备名称</span>
                <Input value={draft.deviceName} onChange={(event) => setDraft((current) => ({ ...current, deviceName: event.target.value }))} placeholder="例如：智能康复护膝" />
              </label>
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-600">设备 ID / 序列号</span>
                <Input value={draft.serialNo} onChange={(event) => setDraft((current) => ({ ...current, serialNo: event.target.value }))} placeholder="例如：TKA-BRACE-001" />
              </label>
              {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
              {saved ? <StatusNotice tone="success">设备资料已更新并同步。</StatusNotice> : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" variant="elder" onClick={bindDevice} disabled={saving}>
                  <ShieldCheck className="size-5" />
                  {saving ? "正在绑定" : "绑定设备"}
                </Button>
                <Button size="lg" variant="outline" onClick={unbindDevice} disabled={saving || !profile?.sensorDeviceId}>
                  <Unlink className="size-5" />
                  解绑设备
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 bg-emerald-950 text-white shadow-xl shadow-emerald-950/15">
            <CardHeader>
              <CardTitle className="text-2xl">当前绑定状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-sm text-emerald-100">患者</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{profile?.name ?? "正在读取"}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-sm text-emerald-100">设备信息</p>
                <p className="mt-2 text-2xl font-bold leading-9">{profile?.sensorDeviceId ?? "暂未绑定设备"}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded-2xl bg-white/10 px-2 py-3">电量 92%</span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">信号 96%</span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">5 秒/次</span>
              </div>
              <Button variant="outline" className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={checkDevice} disabled={checking}>
                <PlugZap className="size-5" />
                {checking ? "正在自检" : "设备连接自检"}
              </Button>
              {checkResult ? <div className="[&_p]:border-white/10 [&_p]:bg-white/10 [&_p]:text-emerald-50"><StatusNotice tone="info">{checkResult}</StatusNotice></div> : null}
              <p className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-emerald-50">绑定结果会同步写入 profiles 表的 sensorDeviceId 字段，护士端查看患者资料时可追踪当前设备。</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
