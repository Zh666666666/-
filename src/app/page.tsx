import Link from "next/link";
import { Activity, ArrowRight, HeartPulse, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const productHighlights = [
  [Activity, "零操作采集", "智能护膝自动上传屈曲角度、活动频次、训练时长和疼痛评分。"],
  [HeartPulse, "家属今日照护", "家属先看到今天该做什么，再查看数据、建议和预约。"],
  [ShieldCheck, "护士随访记录", "预警处理、远程指导、SOAP 记录和上门护理连续留痕。"],
] as const;

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe5] px-4 py-6 text-[#17251f] md:px-10 md:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(circle_at_16%_10%,rgba(91,135,111,0.30),transparent_30rem),radial-gradient(circle_at_82%_5%,rgba(242,195,107,0.25),transparent_27rem)]" />
      <div className="pointer-events-none absolute -left-24 top-72 h-72 w-72 rounded-full bg-[#dfcaa8]/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#9fc4b1]/25 blur-3xl" />

      <section className="family-view-enter relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center gap-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-stretch">
          <div className="relative overflow-hidden rounded-[2.75rem] bg-[#17251f] p-6 text-white shadow-[0_34px_95px_rgba(23,37,31,0.28)] md:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#f2c36b]/24 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#f2c36b]/60 to-transparent" />
            <div className="relative max-w-4xl">
              <div className="mb-8">
                <p className="hello-mark text-[clamp(4.5rem,14vw,10rem)]">hello</p>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.28em] text-[#f2c36b]">Welcome to TKA Care OS</p>
              </div>
              <Badge className="border border-white/15 bg-white/10 px-3 py-1 text-[#f8deb0] shadow-none">家庭到病区的护理协同</Badge>
              <h1 className="mt-8 font-display text-5xl font-bold leading-[1.03] tracking-[-0.055em] text-[#fff7e8] md:text-7xl lg:text-8xl">
                术后康复，从病区延伸到家。
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d6e4da] md:text-xl md:leading-9">
                智能护膝自动记录训练数据，家属按今日任务陪伴康复，护士及时查看预警、给出指导并留下护理记录。
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-[#f2c36b] text-[#17251f] shadow-[0_18px_42px_rgba(242,195,107,0.24)] hover:bg-[#ffd27d]">
                  <Link href="/login">
                    登录进入系统
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                  <Link href="/login">护士端入口</Link>
                </Button>
              </div>
            </div>
          </div>

          <aside className="rounded-[2.5rem] border border-[#e1d3bd] bg-[#fffaf2]/88 p-5 shadow-[0_28px_80px_rgba(46,61,50,0.12)] backdrop-blur md:p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b0823d]">Platform Flow</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">打开后就知道下一步。</h2>
            <div className="mt-7 space-y-3">
              {["家属看到今日照护", "护膝自动同步数据", "护士处理异常预警", "护理记录形成闭环"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-[1.45rem] border border-[#eadfce] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-[#17251f] text-sm font-black text-[#f2c36b]">0{index + 1}</span>
                  <span className="text-sm font-black text-[#17251f]">{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {productHighlights.map(([Icon, title, description]) => (
            <div key={title} className="rounded-[2rem] border border-[#e1d3bd] bg-[#fffaf2]/88 p-5 shadow-[0_18px_60px_rgba(46,61,50,0.08)] backdrop-blur transition-all hover:-translate-y-1 hover:bg-white">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#17251f] text-[#f2c36b]">
                <Icon className="size-6" />
              </span>
              <h2 className="mt-5 text-xl font-black tracking-[-0.02em] text-[#17251f]">{title}</h2>
              <p className="mt-3 leading-7 text-[#5d6c61]">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
