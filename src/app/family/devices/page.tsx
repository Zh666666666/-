"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BatteryMedium, CheckCircle2, ClipboardCopy, Gauge, LinkIcon, Loader2, Radio, ShieldCheck, Smartphone, Wifi } from "lucide-react";

import { StatusNotice } from "@/components/status-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CalibrationRecordItem, DashboardData, DeviceBindingItem, DevicePlacement } from "@/lib/rehab";

type DeviceForm = {
  name: string;
  serialNo: string;
  placement: DevicePlacement;
};

type CalibrationChecks = {
  placement: boolean;
  extension: boolean;
  stillness: boolean;
};

const placementLabels: Record<DevicePlacement, string> = {
  THIGH: "大腿传感器",
  SHANK: "小腿传感器",
  BRACE: "护具传感器",
  UNKNOWN: "未指定",
};

const defaultForm: DeviceForm = {
  name: "WT9011DCL-BT50",
  serialNo: "",
  placement: "THIGH",
};

const defaultCalibrationChecks: CalibrationChecks = {
  placement: false,
  extension: false,
  stillness: false,
};

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "尚未连接";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function FamilyDevicesPage() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("康复患者");
  const [bindings, setBindings] = useState<DeviceBindingItem[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationRecordItem[]>([]);
  const [form, setForm] = useState<DeviceForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrationChecks, setCalibrationChecks] = useState<CalibrationChecks>(defaultCalibrationChecks);

  const loadHardwareState = useCallback(async (nextPatientId?: string) => {
    const id = nextPatientId ?? patientId;

    if (!id) {
      return;
    }

    const [bindingResponse, calibrationResponse] = await Promise.all([
      fetch(`/api/device-bindings?patientId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/device-calibrations?patientId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);

    if (bindingResponse.ok) {
      setBindings((await bindingResponse.json()) as DeviceBindingItem[]);
    }

    if (calibrationResponse.ok) {
      setCalibrations((await calibrationResponse.json()) as CalibrationRecordItem[]);
    }
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const dashboardResponse = await fetch("/api/dashboard", { cache: "no-store" });
        const dashboard = (await dashboardResponse.json()) as DashboardData;
        const patient = dashboard.patients[0];

        if (!patient) {
          throw new Error("没有可绑定的患者档案");
        }

        if (!cancelled) {
          setPatientId(patient.id);
          setPatientName(patient.name);
        }

        await loadHardwareState(patient.id);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "设备状态读取失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadHardwareState]);

  const bindingByPlacement = useMemo(() => {
    return new Map(bindings.map((binding) => [binding.placement, binding]));
  }, [bindings]);

  const latestCalibration = calibrations[0];
  const readyForHardware = Boolean(bindingByPlacement.get("THIGH") && bindingByPlacement.get("SHANK") && latestCalibration);
  const calibrationConfirmed = Object.values(calibrationChecks).every(Boolean);

  async function bindDevice() {
    if (!patientId) {
      setError("还没有读取到患者档案");
      return;
    }

    if (!form.serialNo.trim()) {
      setError("请填写 WT9011DCL-BT50 序列号或你贴在设备上的编号");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const deviceResponse = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNo: form.serialNo.trim(),
          name: form.name.trim() || "WT9011DCL-BT50",
          model: "WT9011DCL-BT50",
          manufacturer: "WitMotion",
        }),
      });

      if (!deviceResponse.ok) {
        throw new Error("设备注册失败");
      }

      const device = (await deviceResponse.json()) as { id: string };
      const bindingResponse = await fetch("/api/device-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device.id,
          patientId,
          placement: form.placement,
        }),
      });

      if (!bindingResponse.ok) {
        throw new Error("设备绑定失败");
      }

      setMessage(`${placementLabels[form.placement]}已绑定。请在 Android 网关选择同一位置并确认患者 ID 后连接上传。`);
      setForm((current) => ({ ...current, serialNo: "", placement: current.placement === "THIGH" ? "SHANK" : "THIGH" }));
      await loadHardwareState(patientId);
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : "设备绑定失败");
    } finally {
      setSaving(false);
    }
  }

  async function calibrate() {
    if (!patientId) {
      return;
    }

    const thigh = bindingByPlacement.get("THIGH");
    const shank = bindingByPlacement.get("SHANK");

    if (!thigh || !shank) {
      setError("请先绑定大腿和小腿两个 WT9011DCL-BT50 传感器");
      return;
    }

    if (!calibrationConfirmed) {
      setError("请按顺序完成三项基础校准确认");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/device-calibrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          thighDeviceId: thigh.deviceId,
          shankDeviceId: shank.deviceId,
          quality: "GOOD",
          zeroFlexionAngle: 0,
          notes: "guided-v1：已确认大腿/小腿设备位置、舒适伸直位与静止状态。该记录用于基础佩戴零点，不替代医疗量角器校准。",
        }),
      });

      if (!response.ok) {
        throw new Error("校准记录保存失败");
      }

      setMessage("基础校准已保存。若重新佩戴或交换传感器位置，请重新完成校准。");
      setCalibrationChecks(defaultCalibrationChecks);
      await loadHardwareState(patientId);
    } catch (calibrationError) {
      setError(calibrationError instanceof Error ? calibrationError.message : "校准失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-6xl space-y-5 md:space-y-6">
        <header className="relative overflow-hidden rounded-2xl border border-[#244d68] bg-[#0d2a40] p-5 text-white shadow-[0_24px_70px_rgba(13,42,64,0.2)] md:p-7">
          <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-[#2a78d6]/25 blur-3xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge className="gap-2 border border-white/15 bg-white/10 px-3 py-1 text-sm text-white">
                <Radio className="size-4" />
                双 WT9011DCL-BT50 已进入实物接入阶段
              </Badge>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">设备身份、患者与实时链路</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[#cfe0e9] md:text-lg md:leading-8">
                两只传感器已经到位。这里用于确认大腿/小腿设备档案和患者 ID；Android 网关使用同一患者 ID 后，双路连接成功即自动记录并上传。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" variant="elder">
                <Link href="/sensor-live">
                  <Radio className="size-5" />
                  打开实时看板
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/hardware-demo">硬件演示</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/family">返回家属端</Link>
              </Button>
            </div>
          </div>
        </header>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {message ? <StatusNotice tone="success">{message}</StatusNotice> : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <Card className="bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Smartphone className="size-7 text-emerald-700" />
                绑定 WT9011DCL-BT50
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">当前患者</p>
                <p className="mt-1 text-2xl font-black">{patientName}</p>
                <div className="mt-3 rounded-2xl border border-dashed border-emerald-300 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Android 网关患者 ID</p>
                  <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{patientId ?? "读取中..."}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Android 网关平台地址填写 `https://www.dorianaistudio.cloud`，患者 ID 必须与下面这一串完全一致。完成一次 Token 验证后，两只传感器连接成功会自动开始实时上传。
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={!patientId}
                    onClick={async () => {
                      if (!patientId) return;
                      try {
                        await navigator.clipboard.writeText(patientId);
                        setMessage(`患者 ID 已复制：${patientId}`);
                      } catch {
                        setError("复制失败，请长按患者 ID 手动复制");
                      }
                    }}
                  >
                    <ClipboardCopy className="size-4" />
                    复制患者 ID
                  </Button>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-600">设备名称</span>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-600">序列号 / 自定义编号</span>
                <Input value={form.serialNo} onChange={(event) => setForm((current) => ({ ...current, serialNo: event.target.value }))} placeholder="例如 WT9011DCL-THIGH-001" />
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(["THIGH", "SHANK"] as DevicePlacement[]).map((placement) => (
                  <Button
                    key={placement}
                    type="button"
                    variant={form.placement === placement ? "elder" : "outline"}
                    onClick={() => setForm((current) => ({ ...current, placement }))}
                  >
                    {placementLabels[placement]}
                  </Button>
                ))}
              </div>

              <Button size="lg" variant="elder" onClick={bindDevice} disabled={saving || loading} className="w-full">
                {saving ? <Loader2 className="size-5 animate-spin" /> : <LinkIcon className="size-5" />}
                绑定到患者
              </Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 bg-emerald-950 text-white shadow-xl shadow-emerald-950/15">
            <CardHeader>
              <CardTitle className="text-2xl">真实采集准备度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(["THIGH", "SHANK"] as DevicePlacement[]).map((placement) => {
                  const binding = bindingByPlacement.get(placement);
                  const device = binding?.device;

                  return (
                    <div key={placement} className="rounded-3xl border border-white/10 bg-white/10 p-4">
                      <p className="text-sm text-emerald-100">{placementLabels[placement]}</p>
                      <p className="mt-2 min-h-14 text-lg font-black leading-7">{device?.serialNo ?? "未绑定"}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-50">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                          <Wifi className="size-3" />
                          {device?.status ?? "UNBOUND"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                          <BatteryMedium className="size-3" />
                          {device?.batteryLevel ?? "--"}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-sm text-emerald-100">最近基础校准</p>
                <p className="mt-2 text-xl font-black">{latestCalibration?.quality === "GOOD" ? "已完成" : "未完成"}</p>
                <p className="mt-1 text-sm text-emerald-50">{formatTime(latestCalibration?.createdAt)}</p>
              </div>

              <div className="space-y-3 rounded-3xl border border-white/10 bg-white/10 p-5">
                <div>
                  <p className="font-bold">开始前依次确认</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-100">重新佩戴、交换位置或明显移动绑带后，都需要重新确认。</p>
                </div>
                {([
                  ["placement", "1. 大腿与小腿传感器位置正确，安装方向一致"],
                  ["extension", "2. 腿放松并保持在舒适伸直位，不要强行压直"],
                  ["stillness", "3. 两只传感器均已连接，身体保持静止"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-emerald-400"
                      checked={calibrationChecks[key]}
                      onChange={(event) => setCalibrationChecks((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <p className="text-xs leading-5 text-emerald-100">这是基础佩戴零点确认，用于提升双传感器数据一致性，不替代医疗量角器测量。</p>
              </div>

              <Button variant="outline" className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={calibrate} disabled={saving || loading || !calibrationConfirmed}>
                <ShieldCheck className="size-5" />
                完成基础校准
              </Button>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded-2xl bg-white/10 px-2 py-3">
                  <CheckCircle2 className="mx-auto mb-1 size-4" />
                  {readyForHardware ? "双路已绑定" : "待完成绑定"}
                </span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">
                  <Gauge className="mx-auto mb-1 size-4" />
                  {latestCalibration?.quality === "GOOD" ? "已校准" : "待归零"}
                </span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">
                  <Activity className="mx-auto mb-1 size-4" />
                  HARDWARE
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
