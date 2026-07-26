import Link from "next/link";
import { Activity, ArrowRight, HeartPulse, ShieldCheck } from "lucide-react";

import { BrandLockup, RangeOfMotionDial, TrendRidge } from "@/components/brand";
import { Button } from "@/components/ui/button";

const capabilities = [
  {
    icon: Activity,
    title: "零操作采集",
    description: "智能护膝自动上传屈曲角度、活动频次、训练时长与疼痛评分，家属无需手动记录。",
    meta: "Sensor",
  },
  {
    icon: HeartPulse,
    title: "家属今日照护",
    description: "家属打开先看到今天该做什么，再查看数据、护士建议与上门预约。",
    meta: "Family",
  },
  {
    icon: ShieldCheck,
    title: "护士随访记录",
    description: "预警处理、远程指导、SOAP 记录与上门护理连续留痕，随访有据可循。",
    meta: "Nurse",
  },
] as const;

const flow = [
  ["01", "家属看到今日照护", "打开即知下一步，不必翻找。"],
  ["02", "护膝自动同步数据", "训练结束即入库，无需人工录入。"],
  ["03", "护士处理异常预警", "异常集中呈现，先处理最紧急的。"],
  ["04", "护理记录形成闭环", "指导与记录归档，复盘有完整链路。"],
] as const;

export default function Home() {
  return (
    <main className="bg-canvas text-ink-900">
      {/* ---------------- 首屏 ---------------- */}
      <section className="panel-ink grain rim-light relative flex min-h-[100dvh] flex-col overflow-hidden px-5 pb-8 pt-5 sm:px-8 lg:px-14 lg:pb-12 lg:pt-8 xl:px-20">
        <div
          className="pointer-events-none absolute -right-40 top-1/2 aspect-square w-[34rem] -translate-y-1/2 opacity-45 sm:w-[42rem] lg:-right-28 lg:opacity-60 xl:w-[52rem]"
          aria-hidden="true"
        >
          <RangeOfMotionDial />
        </div>

        <header className="relative z-10 flex items-center justify-between gap-4">
          <BrandLockup tone="light" subtitle="术后康复监测平台" />
          <div className="flex items-center gap-2">
            <Link
              href="#capabilities"
              className="hidden rounded-full px-3.5 py-2 text-[0.8125rem] font-medium text-white/60 transition-colors hover:text-white sm:inline-flex"
            >
              平台能力
            </Link>
            <Button
              asChild
              size="sm"
              className="h-9 rounded-full border border-white/15 bg-white/[0.08] text-white shadow-none backdrop-blur hover:bg-white/[0.16]"
            >
              <Link href="/login">
                登录
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-center py-10 lg:py-16">
          <div className="max-w-3xl">
            <p className="eyebrow rise text-brass-300" style={{ ["--i" as string]: 0 }}>
              家庭到病区的护理协同
            </p>
            <h1
              className="display-xl rise mt-5 text-[2.6rem] text-[#f7f3ea] sm:text-[3.6rem] lg:mt-8 lg:text-[5rem] xl:text-[6rem]"
              style={{ ["--i" as string]: 1 }}
            >
              术后康复，
              <br />
              从病区延伸到家。
            </h1>
            <p
              className="rise mt-5 max-w-xl text-[0.9375rem] leading-7 text-white/60 lg:mt-9 lg:text-lg lg:leading-8"
              style={{ ["--i" as string]: 2 }}
            >
              智能护膝自动记录训练数据，家属按今日任务陪伴康复，护士及时查看预警、给出指导并留下护理记录。
            </p>

            <div className="rise mt-8 flex flex-col gap-2.5 sm:flex-row lg:mt-11" style={{ ["--i" as string]: 3 }}>
              <Button asChild size="lg" variant="brass" className="group h-12 rounded-lg px-6">
                <Link href="/login">
                  登录进入系统
                  <ArrowRight className="size-4 transition-transform duration-250 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-lg border-white/18 bg-white/[0.06] px-6 text-white shadow-none backdrop-blur hover:border-white/30 hover:bg-white/[0.12]"
              >
                <Link href="/login">护士端入口</Link>
              </Button>
            </div>
          </div>
        </div>

        <div
          className="rise relative z-10 grid gap-y-6 border-t border-white/10 pt-7 sm:grid-cols-3"
          style={{ ["--i" as string]: 4 }}
        >
          {capabilities.map(({ title, meta }, index) => (
            <div key={title} className={index > 0 ? "sm:border-l sm:border-white/10 sm:pl-7" : ""}>
              <p className="flex items-baseline gap-2.5">
                <span className="serif-accent text-lg leading-none text-brass-400/90">0{index + 1}</span>
                <span className="eyebrow text-brass-400/75">{meta}</span>
              </p>
              <p className="mt-2.5 text-[0.9375rem] font-medium text-[#f7f3ea]">{title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- 平台能力 ---------------- */}
      <section id="capabilities" className="ambient relative scroll-mt-8 px-5 py-20 sm:px-8 lg:px-14 lg:py-32 xl:px-20">
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow text-brass-700">Capabilities</p>
              <h2 className="display-lg mt-4 text-[1.875rem] lg:text-[2.75rem]">
                数据、照护与随访，
                <br className="hidden lg:block" />
                收在同一条链路里。
              </h2>
            </div>
            <p className="serif-accent hidden text-lg text-[var(--subtle-foreground)] lg:block">
              one loop, from ward to home
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:mt-16 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, description, meta }, index) => (
              <article
                key={title}
                className="group relative overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-e2 transition-[transform,box-shadow,border-color] duration-350 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-ink-700/20 hover:shadow-e3 lg:p-7"
              >
                <div className="flex items-start justify-between">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-ink-900 text-brass-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <Icon className="size-5" />
                  </span>
                  <span className="serif-accent text-2xl leading-none text-brass-700/70 transition-colors duration-350 group-hover:text-brass-700">
                    0{index + 1}
                  </span>
                </div>
                <p className="eyebrow mt-6 text-[var(--subtle-foreground)]">{meta}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.015em]">{title}</h3>
                <p className="mt-2.5 text-[0.9375rem] leading-7 text-[var(--muted-foreground)]">{description}</p>
                <div className="mt-7 opacity-70 transition-opacity duration-350 group-hover:opacity-100">
                  <TrendRidge className="h-10" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 平台流程 ---------------- */}
      <section className="border-t border-[var(--hairline)] bg-[var(--surface-2)] px-5 py-20 sm:px-8 lg:px-14 lg:py-32 xl:px-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow text-brass-700">Platform Flow</p>
              <h2 className="display-lg mt-4 text-[1.875rem] lg:text-[2.5rem]">打开后就知道下一步。</h2>
            </div>
          </div>

          <ol className="mt-12 grid border-t border-[var(--hairline)] lg:mt-16 lg:grid-cols-4">
            {flow.map(([index, title, description], position) => (
              <li
                key={index}
                className={`border-b border-[var(--hairline)] py-7 lg:border-b-0 lg:py-10 lg:pr-7 ${
                  position > 0 ? "lg:border-l lg:border-[var(--hairline)] lg:pl-7" : ""
                }`}
              >
                <p className="serif-accent text-[2rem] leading-none text-brass-700">{index}</p>
                <p className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.015em]">{title}</p>
                <p className="mt-2 text-[0.875rem] leading-6 text-[var(--muted-foreground)]">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- 收尾 CTA ---------------- */}
      <section className="border-t border-[var(--hairline)] px-5 py-16 sm:px-8 lg:px-14 lg:py-24 xl:px-20">
        <div className="panel-ink grain rim-light relative mx-auto max-w-6xl overflow-hidden rounded-2xl px-6 py-14 text-center lg:rounded-3xl lg:px-16 lg:py-20">
          <div
            className="pointer-events-none absolute -right-36 -top-40 aspect-square w-[26rem] opacity-40 lg:w-[32rem]"
            aria-hidden="true"
          >
            <RangeOfMotionDial />
          </div>
          <div className="relative z-10 mx-auto max-w-2xl">
            <p className="eyebrow text-brass-300">Get Started</p>
            <h2 className="display-lg mt-4 text-[1.75rem] text-[#f7f3ea] lg:text-[2.75rem]">
              下一次训练，从这里开始。
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-7 text-white/55 lg:text-base">
              家属与护士使用同一个入口登录，按角色进入各自的工作台。
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row lg:mt-10">
              <Button asChild size="lg" variant="brass" className="group h-12 rounded-lg px-7">
                <Link href="/login">
                  登录进入系统
                  <ArrowRight className="size-4 transition-transform duration-250 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-lg border-white/18 bg-white/[0.06] px-7 text-white shadow-none backdrop-blur hover:border-white/30 hover:bg-white/[0.12]"
              >
                <Link href="/register">注册家属账号</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 页脚 ---------------- */}
      <footer className="border-t border-[var(--hairline)] px-5 py-10 sm:px-8 lg:px-14 xl:px-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <BrandLockup subtitle="TKA 术后膝关节康复监测管理平台" />
          <p className="text-[0.75rem] leading-5 text-[var(--subtle-foreground)]">
            训练与护理数据仅对授权角色可见
          </p>
        </div>
      </footer>
    </main>
  );
}
