import Link from "next/link";
import { Activity, HeartPulse, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="rehab-grid min-h-screen px-6 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center gap-10">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
            <ShieldCheck className="size-4" />
            Supabase Realtime + Prisma + Next.js 15
          </div>
          <div className="space-y-5">
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-slate-950 md:text-7xl">
              TKA 术后膝关节康复监测管理平台
            </h1>
            <p className="max-w-2xl text-xl leading-9 text-slate-600">
              智能护膝自动上传屈曲角度、活动频次与训练时长，护士端实时监测趋势并触发 AI 异常预警，支持一键远程指导和护理记录闭环。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="elder">
              <Link href="/login">登录进入系统</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">护士端登录</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            [Activity, "零操作采集", "护膝端按固定周期上传角度、频次、时长和疼痛评分。"],
            [HeartPulse, "AI 异常预警", "低活动量、低屈曲角度、高疼痛评分会自动生成红色预警。"],
            [ShieldCheck, "护理闭环", "护士远程指导、记录护理动作，并在仪表盘留痕。"],
          ].map(([Icon, title, description]) => (
            <Card key={String(title)} className="bg-white/75">
              <CardContent className="space-y-4 p-6">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Icon className="size-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{title as string}</h2>
                  <p className="mt-2 leading-7 text-slate-600">{description as string}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
