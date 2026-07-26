"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BatteryMedium,
  Bluetooth,
  CheckCircle2,
  CloudUpload,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Wifi,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SamplePoint = {
  id: number;
  time: string;
  thighPitch: number;
  shankPitch: number;
  angle: number;
  confidence: number;
};

type UploadItem = {
  id: string;
  label: string;
  status: "queued" | "uploaded" | "alert";
};

const maxHistory = 18;

const initialSample: SamplePoint = {
  id: 0,
  time: "--:--:--",
  thighPitch: 7,
  shankPitch: 99,
  angle: 92,
  confidence: 0.9,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function createSample(index: number, forceLow = false): SamplePoint {
  const wave = Math.sin(index / 2.4);
  const thighPitch = 7 + Math.sin(index / 4) * 2.5;
  const baseAngle = forceLow ? 58 : 92 + wave * 22;
  const shankPitch = thighPitch + baseAngle;

  return {
    id: index,
    time: formatTime(),
    thighPitch: Math.round(thighPitch * 10) / 10,
    shankPitch: Math.round(shankPitch * 10) / 10,
    angle: Math.round(clamp(baseAngle, 0, 145) * 10) / 10,
    confidence: Math.round((0.86 + Math.cos(index / 5) * 0.08) * 100) / 100,
  };
}

function sourceLabel(status: UploadItem["status"]) {
  if (status === "alert") {
    return "已预警";
  }

  return status === "uploaded" ? "已上传" : "待上传";
}

export default function HardwareDemoPage() {
  const demoMode = process.env.NEXT_PUBLIC_APP_MODE === "demo";

  return demoMode ? <DemoHardwarePage /> : <ProductionHardwareDiagnostic />;
}

function ProductionHardwareDiagnostic() {
  return (
    <main className="rehab-grid min-h-screen overflow-x-hidden px-4 py-4 text-[#12211c] md:px-8 md:py-6">
      <section className="mx-auto grid w-full min-w-0 max-w-5xl gap-4">
        <header className="min-w-0 overflow-hidden rounded-lg border border-[#e5dbc9] bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" className="gap-2 px-3 py-1">
              <Bluetooth className="size-4" />
              真实硬件诊断
            </Badge>
            <Badge variant="outline">生产环境</Badge>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-[#12211c] md:text-4xl">BT50 采集链路检查</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#576860] md:text-base">
            生产环境不会生成模拟传感器帧。请从实时页查看 Android App 实际上传的大腿与小腿数据；
            没有真实上传时，实时页会明确显示设备离线并保留最后姿态。
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="min-w-0 border-[#a8c6b4] bg-[#f0f6f2] shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <Activity className="size-5 text-emerald-700" />
                查看真实实时数据
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-[#4d5c53]">
                核对双路原始帧、端到端延迟、3D 姿态、离线状态以及质量门诊断。页面只读取服务器收到的真实 App 样本。
              </p>
              <Button asChild className="w-full">
                <Link href="/sensor-live">
                  <Wifi className="size-4" />
                  进入实时诊断
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="min-w-0 border-[#e5dbc9] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-[#12211c]">
                <ShieldCheck className="size-5 text-emerald-700" />
                检查绑定与校准
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-[#576860]">
                核对当前患者的大腿、小腿设备分配和最近一次基础校准。设备关闭后，本页不会继续显示变化数据。
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/family/devices">
                  <Bluetooth className="size-4" />
                  打开设备管理
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            当前页面没有收到任何样本，也不会自行造数。真实设备是否在线、数据是否新鲜，请以实时诊断页的帧时间与“实时/离线”标识为准。
          </p>
        </div>
      </section>
    </main>
  );
}

function DemoHardwarePage() {
  const [running, setRunning] = useState(true);
  const [calibrated, setCalibrated] = useState(true);
  const nextSampleIndex = useRef(1);
  const [history, setHistory] = useState<SamplePoint[]>([initialSample]);
  const [uploads, setUploads] = useState<UploadItem[]>([
    { id: "thigh-connected", label: "WT9011DCL-THIGH-001 已连接", status: "uploaded" },
    { id: "shank-connected", label: "WT9011DCL-SHANK-001 已连接", status: "uploaded" },
    { id: "initial-calibration", label: "零点校准 GOOD", status: "uploaded" },
  ]);
  const [apiState, setApiState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = window.setInterval(() => {
      const sample = createSample(nextSampleIndex.current);
      nextSampleIndex.current += 1;
      const upload: UploadItem = {
        id: crypto.randomUUID(),
        label: `屈曲 ${sample.angle.toFixed(0)} 度 · 可信度 ${(sample.confidence * 100).toFixed(0)}%`,
        status: sample.angle < 78 ? "alert" : "uploaded",
      };

      setHistory((items) => [...items.slice(-(maxHistory - 1)), sample]);
      setUploads((items) => [upload, ...items].slice(0, 8));
    }, 1200);

    return () => window.clearInterval(timer);
  }, [running]);

  const latest = history.at(-1) ?? initialSample;
  const angleStatus = latest.angle < 78 ? "需要护士复核" : latest.angle >= 105 ? "接近目标范围" : "稳定训练中";
  const alertOpen = latest.angle < 78;
  const minAngle = Math.min(...history.map((item) => item.angle));
  const maxAngle = Math.max(...history.map((item) => item.angle));

  const nurseSteps = useMemo(() => [
    { label: "数据入库", done: true },
    { label: "风险评估", done: true },
    { label: alertOpen ? "预警待处理" : "常规观察", done: !alertOpen },
    { label: "指导记录", done: false },
  ], [alertOpen]);

  async function saveToLocalApi() {
    setApiState("saving");

    try {
      const response = await fetch("/api/hardware-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: "demo-patient-1" }),
      });

      if (!response.ok) {
        throw new Error("upload failed");
      }

      setApiState("saved");
      setUploads((items) => [
        { id: crypto.randomUUID(), label: "已写入本地 DEMO 演示样本", status: "uploaded" as const },
        ...items,
      ].slice(0, 8));
    } catch {
      setApiState("failed");
    }
  }

  function injectLowAngle() {
    const sample = createSample(nextSampleIndex.current, true);
    nextSampleIndex.current += 1;
    setHistory((items) => [...items.slice(-(maxHistory - 1)), sample]);
    setUploads((items) => [
      { id: crypto.randomUUID(), label: `屈曲 ${sample.angle.toFixed(0)} 度 · 触发 ROM 预警`, status: "alert" as const },
      ...items,
    ].slice(0, 8));
  }

  function resetCalibration() {
    setCalibrated(true);
    setUploads((items) => [
      { id: crypto.randomUUID(), label: "伸直位零点校准 GOOD", status: "uploaded" as const },
      ...items,
    ].slice(0, 8));
  }

  return (
    <main className="rehab-grid min-h-screen overflow-x-hidden px-4 py-4 text-[#12211c] md:px-8 md:py-6">
      <section className="mx-auto grid w-full min-w-0 max-w-7xl gap-4">
        <header className="min-w-0 overflow-hidden rounded-lg border border-[#e5dbc9] bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" className="gap-2 px-3 py-1">
                  <Bluetooth className="size-4" />
                  DEMO · WT9011DCL-BT50 双传感器模拟
                </Badge>
                <Badge variant={alertOpen ? "warning" : "secondary"} className="px-3 py-1">
                  {angleStatus}
                </Badge>
              </div>
              <h1 className="mt-3 break-words text-2xl font-semibold md:text-4xl">膝关节模拟闭环工作台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#576860] md:text-base">
                本页仅在 Demo 模式生成明确标注的模拟姿态，用于演示上传、预警和护理处置流程，不代表真实硬件采集。
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/family/devices">设备页</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/nurse">护士端</Link>
              </Button>
              <Button onClick={() => setRunning((value) => !value)} variant={running ? "secondary" : "elder"}>
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? "暂停采集" : "开始采集"}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity className="size-5 text-[#3c6552]" />
                实时角度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="min-w-0 rounded-lg border border-[#e5dbc9] bg-[#fdfbf7] p-4">
                  <div className="relative mx-auto flex aspect-square max-w-[21rem] items-center justify-center rounded-full border border-[#e5dbc9] bg-[#f0f6f2]">
                    <div className="absolute h-[42%] w-5 origin-bottom rounded-full bg-[#497a62] shadow-lg" style={{ transform: `translateY(-36%) rotate(${latest.thighPitch - 8}deg)` }} />
                    <div className="absolute h-[45%] w-5 origin-top rounded-full bg-[#a97c37] shadow-lg" style={{ transform: `translateY(36%) rotate(${latest.angle - 88}deg)` }} />
                    <div className="absolute flex size-24 flex-col items-center justify-center rounded-full border border-[#e5dbc9] bg-white shadow-sm">
                      <span className="text-3xl font-semibold">{latest.angle.toFixed(0)}°</span>
                      <span className="text-xs font-medium text-[#576860]">屈曲角</span>
                    </div>
                    <span className="absolute left-5 top-8 rounded-full bg-[#e2ede6] px-3 py-1 text-xs font-medium text-[#3c6552]">大腿 IMU</span>
                    <span className="absolute bottom-8 right-5 rounded-full bg-[#fbf1dd] px-3 py-1 text-xs font-medium text-[#6f4c1c]">小腿 IMU</span>
                  </div>
                </div>

                <div className="grid min-w-0 content-start gap-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      ["屈曲角", `${latest.angle.toFixed(1)}°`],
                      ["伸直偏差", `${Math.max(0, 110 - latest.angle).toFixed(0)}°`],
                      ["可信度", `${(latest.confidence * 100).toFixed(0)}%`],
                      ["采样时间", latest.time],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-[#e5dbc9] bg-white p-3">
                        <p className="text-xs font-medium text-[#576860]">{label}</p>
                        <p className="mt-2 text-xl font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-[#e5dbc9] bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-semibold">最近采集曲线</p>
                      <p className="text-xs font-medium text-[#576860]">范围 {minAngle.toFixed(0)}° - {maxAngle.toFixed(0)}°</p>
                    </div>
                    <div className="flex h-44 items-end gap-1">
                      {history.map((item) => (
                        <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div
                            className={`w-full rounded-t-md ${item.angle < 78 ? "bg-red-500" : "bg-[#3c6552]"}`}
                            style={{ height: `${Math.max(12, (item.angle / 145) * 100)}%` }}
                            title={`${item.angle.toFixed(1)}°`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                    <Button className="w-full min-w-0" onClick={resetCalibration} variant="outline">
                      <RotateCcw className="size-4" />
                      零点校准
                    </Button>
                    <Button className="w-full min-w-0" onClick={injectLowAngle} variant="outline">
                      <AlertTriangle className="size-4" />
                      触发预警
                    </Button>
                    <Button className="w-full min-w-0" onClick={saveToLocalApi} variant="elder" disabled={apiState === "saving"}>
                      <CloudUpload className="size-4" />
                      {apiState === "saving" ? "写入中" : "写入本地 API"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-4">
            <Card className="min-w-0 overflow-hidden bg-[#12211c] text-white">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Wifi className="size-5 text-[#ddb474]" />
                  设备状态
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  ["WT9011DCL-THIGH-001", "大腿", "94%", "88%"],
                  ["WT9011DCL-SHANK-001", "小腿", "96%", "90%"],
                ].map(([serial, placement, signal, battery]) => (
                  <div key={serial} className="rounded-lg border border-white/10 bg-white/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#f7f3ea]">{serial}</p>
                        <p className="mt-1 text-xs text-[#c9d6ce]">{placement} · 已绑定 · {calibrated ? "校准 GOOD" : "待校准"}</p>
                      </div>
                      <CheckCircle2 className="size-5 text-emerald-300" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                        <Wifi className="size-3" />
                        信号 {signal}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                        <BatteryMedium className="size-3" />
                        电量 {battery}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CloudUpload className="size-5 text-[#3c6552]" />
                  上传队列
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {uploads.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5dbc9] bg-white/75 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{item.label}</span>
                    <Badge variant={item.status === "alert" ? "warning" : "success"}>{sourceLabel(item.status)}</Badge>
                  </div>
                ))}
                {apiState === "saved" ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">本地 API 已收到 DEMO 演示样本。</p> : null}
                {apiState === "failed" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">本地 API 暂未响应，请先启动开发服务。</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <Card className={`min-w-0 overflow-hidden ${alertOpen ? "border-red-200 bg-red-50/90" : "border-[#a8c6b4] bg-[#f0f6f2]"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className={`size-5 ${alertOpen ? "text-red-600" : "text-emerald-700"}`} />
                风险评估
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{alertOpen ? "ROM_LOW 高优先级预警" : "当前未触发高优先级预警"}</p>
              <p className="mt-2 text-sm leading-6 text-[#576860]">
                {alertOpen ? "屈曲角度低于 78 度，护士端需要复核疼痛、肿胀、佩戴位置和动作质量。" : "角度趋势稳定，继续观察训练频次、训练时长和疼痛评分。"}
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Stethoscope className="size-5 text-[#3c6552]" />
                护理处理闭环
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-4">
                {nurseSteps.map((step, stepIndex) => (
                  <div key={step.label} className={`rounded-lg border p-3 ${step.done ? "border-emerald-200 bg-emerald-50" : "border-[#e5dbc9] bg-white/75"}`}>
                    <p className="text-xs font-semibold text-[#576860]">0{stepIndex + 1}</p>
                    <p className="mt-2 font-semibold">{step.label}</p>
                    <p className="mt-1 text-xs font-semibold text-[#576860]">{step.done ? "已完成" : "等待护士确认"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-[#e5dbc9] bg-white/75 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 text-[#3c6552]" />
                  <p className="text-sm leading-6 text-[#4d5c53]">
                    本页仅用于演示业务链路。当前样本来自本地模拟，写入 API 后会以 `DEMO` 来源进入趋势和预警，不能作为真实硬件数据使用。真实采集请使用 Android 网关连接双 BT50。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
