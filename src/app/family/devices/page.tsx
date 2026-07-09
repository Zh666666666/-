"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BatteryMedium, CheckCircle2, Gauge, LinkIcon, Loader2, Radio, RotateCcw, ShieldCheck, Smartphone, Wifi } from "lucide-react";

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
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSimulatedAngle, setLastSimulatedAngle] = useState<number | null>(null);

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

      setMessage(`${placementLabels[form.placement]}已绑定，传感器到货后可直接接入采集端。`);
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
          notes: "伸直位零点校准。传感器到货后用实测姿态覆盖这条记录。",
        }),
      });

      if (!response.ok) {
        throw new Error("校准记录保存失败");
      }

      setMessage("零点校准记录已保存。实物到货后按同一流程替换为真实校准。");
      await loadHardwareState(patientId);
    } catch (calibrationError) {
      setError(calibrationError instanceof Error ? calibrationError.message : "校准失败");
    } finally {
      setSaving(false);
    }
  }

  async function simulateHardwareSample() {
    if (!patientId) {
      return;
    }

    setSimulating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/hardware-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });

      if (!response.ok) {
        throw new Error("硬件模拟采集失败");
      }

      const data = (await response.json()) as { record?: { flexionAngle?: number }; simulated?: { flexionAngle?: number } };
      setLastSimulatedAngle(data.record?.flexionAngle ?? data.simulated?.flexionAngle ?? null);
      setMessage("已写入一条硬件格式样本，并同步生成康复记录。护士端趋势图会读到这条数据。");
      await loadHardwareState(patientId);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : "硬件模拟失败");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-6xl space-y-5 md:space-y-6">
        <header className="overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_28rem),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.9))] p-5 shadow-sm md:rounded-[2rem] md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
                <Radio className="size-4" />
                WT9011DCL-BT50 真实设备准备
              </Badge>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">设备绑定与校准</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 md:text-lg md:leading-8">
                先把大腿和小腿两个传感器档案建好。传感器到货后，手机采集端只要按这里的绑定关系上传数据，就能进入真实康复闭环。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" variant="elder">
                <Link href="/hardware-demo">
                  <Radio className="size-5" />
                  打开硬件演示
                </Link>
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
                <p className="text-sm text-emerald-100">最近校准</p>
                <p className="mt-2 text-xl font-black">{latestCalibration ? latestCalibration.quality : "未校准"}</p>
                <p className="mt-1 text-sm text-emerald-50">{formatTime(latestCalibration?.createdAt)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={calibrate} disabled={saving || loading}>
                  <ShieldCheck className="size-5" />
                  保存零点校准
                </Button>
                <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={simulateHardwareSample} disabled={simulating || loading}>
                  {simulating ? <Loader2 className="size-5 animate-spin" /> : <RotateCcw className="size-5" />}
                  模拟硬件采集
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded-2xl bg-white/10 px-2 py-3">
                  <CheckCircle2 className="mx-auto mb-1 size-4" />
                  {readyForHardware ? "可接入" : "待准备"}
                </span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">
                  <Gauge className="mx-auto mb-1 size-4" />
                  {lastSimulatedAngle ? `${lastSimulatedAngle.toFixed(0)}°` : "--"}
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
