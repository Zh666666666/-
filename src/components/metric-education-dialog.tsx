"use client";

import type { ReactNode } from "react";
import { Activity, BadgeInfo, Dumbbell, FlameKindling, HandHeart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type MetricEducationKey = "flexion" | "extension" | "frequency" | "duration" | "rom" | "pain" | "battery";

type MetricEducation = {
  title: string;
  normalRange: string;
  explanation: string;
  tcmAdvice: string[];
  prompts: string[];
};

const metricEducation: Record<MetricEducationKey, MetricEducation> = {
  flexion: {
    title: "膝关节屈曲度",
    normalRange: "TKA 术后 1-3 个月通常目标为 90°-120°，个体目标需结合术式、疼痛和肿胀程度调整。",
    explanation: "屈曲度反映膝关节弯曲能力，是坐下、上下楼梯和步态恢复的重要指标。中医康复可理解为经络气血运行与筋骨活动度逐步恢复。",
    tcmAdvice: ["训练前可热敷 10-15 分钟，急性肿胀或发热时避免热敷。", "可轻柔按揉血海、阳陵泉、足三里周围，每处 1-2 分钟。", "以坐位主动屈膝和床边垂腿为主，避免暴力压腿。"],
    prompts: ["示意：坐位屈膝时脚跟缓慢向后滑，保持 5 秒后放松。", "观察：屈曲角度连续下降或疼痛升高时，应联系护士复核。"],
  },
  extension: {
    title: "膝关节伸直度",
    normalRange: "TKA 术后 1-3 个月建议尽量接近 0° 伸直，轻度伸直受限常见但应持续改善。",
    explanation: "伸直度影响站立稳定性和步行效率。伸直不足会增加股四头肌负担，也可能导致步态代偿。",
    tcmAdvice: ["可进行踝泵和股四头肌等长收缩，促进下肢循环。", "膝下不要长期垫高枕头，避免形成屈曲挛缩。", "局部僵硬可在护士确认无红肿热痛后配合温和热敷。"],
    prompts: ["示意：平卧时脚尖回勾，膝后轻贴床面，保持 5-10 秒。", "提示：不要让家属强压膝盖，疼痛明显时停止。"],
  },
  frequency: {
    title: "活动频次",
    normalRange: "TKA 术后 1-3 个月通常建议少量多次，每日 6-12 组轻中等强度训练。",
    explanation: "频次体现康复依从性。过少会影响活动度恢复，过多则可能加重疼痛和肿胀。",
    tcmAdvice: ["遵循“动静结合”，训练间隙抬高患肢休息。", "可配合腹式呼吸和放松训练，降低疼痛敏感。", "训练后膝部胀痛明显时先减少频次并反馈护士。"],
    prompts: ["示意：每 2-3 小时完成 1 组短训练，比一次过量训练更安全。", "记录：每次训练后记录疼痛和肿胀变化。"],
  },
  duration: {
    title: "训练时间",
    normalRange: "TKA 术后 1-3 个月每日累计训练约 20-45 分钟，可拆分为多次完成。",
    explanation: "训练时间用于评估日训练量。合理时长可以促进肌力和关节活动度恢复，过长则可能诱发炎症反应。",
    tcmAdvice: ["以微汗不疲劳为度，避免久练伤气。", "训练前后注意膝部保暖，出汗后及时擦干。", "可结合八段锦式上肢放松动作，但膝部动作需遵医嘱。"],
    prompts: ["示意：每组 5-8 分钟，分散到全天。", "提示：训练后疼痛超过 6/10 或持续肿胀，应减少时长。"],
  },
  rom: {
    title: "ROM 关节活动范围",
    normalRange: "ROM 综合屈曲与伸直，术后 1-3 个月常以屈曲 90° 以上、伸直接近 0° 作为阶段参考。",
    explanation: "ROM 是关节功能恢复的核心指标，既看能弯多少，也看能否伸直。中西医结合关注结构恢复、疼痛控制和气血通畅。",
    tcmAdvice: ["结合屈伸训练、踝泵和步态练习，循序渐进。", "穴位调护以血海、足三里、阳陵泉为主，避开切口。", "肿胀明显时优先冷敷和抬高，稳定后再考虑热敷。"],
    prompts: ["示意：ROM 趋势应逐周改善，不追求单次极限。", "观察：活动范围下降合并疼痛升高时需评估感染、积液或训练过量。"],
  },
  pain: {
    title: "疼痛评分",
    normalRange: "0-3 分为轻度，4-6 分为中度，7 分及以上需要护士重点评估。",
    explanation: "疼痛会直接影响训练质量和依从性。短暂训练痛可观察，持续升高或夜间痛需关注。",
    tcmAdvice: ["疼痛升高时先减少训练强度，配合抬高和冷敷。", "情志紧张会放大疼痛感，可做腹式呼吸和音乐放松。", "热敷只适合无明显红肿热痛的恢复期。"],
    prompts: ["提示：疼痛 ≥7 分、切口异常或发热需及时联系医护。", "记录：标注疼痛发生时间、动作和缓解方式。"],
  },
  battery: {
    title: "设备电量与连接",
    normalRange: "建议设备电量保持 30% 以上，信号稳定时数据更可靠。",
    explanation: "设备状态会影响数据连续性。电量过低或信号差可能造成上传延迟，护士端看到的数据会不完整。",
    tcmAdvice: ["设备佩戴松紧适度，避免压迫皮肤和影响局部循环。", "训练前检查设备位置，保持膝部皮肤干燥。", "若皮肤红痒或压痕明显，暂停佩戴并反馈护士。"],
    prompts: ["示意：训练前确认设备贴合髌骨周围，不遮挡切口。", "提示：每日固定时间充电，避免夜间断连。"],
  },
};

export function MetricEducationDialog({ metric, children }: { metric: MetricEducationKey; children: ReactNode }) {
  const item = metricEducation[metric];

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <Badge className="w-fit bg-sky-600 text-white">TKA 术后 1-3 个月参考</Badge>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>{item.normalRange}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="rounded-3xl border border-sky-100 bg-sky-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-800">
              <BadgeInfo className="size-5" />
              科普解释
            </div>
            <p className="mt-3 text-base leading-8 text-slate-700">{item.explanation}</p>
          </section>

          <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <HandHeart className="size-5" />
              中医康复建议
            </div>
            <div className="mt-3 grid gap-2">
              {item.tcmAdvice.map((advice) => (
                <p key={advice} className="rounded-2xl bg-white/80 px-3 py-2 text-sm leading-6 text-emerald-950">{advice}</p>
              ))}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            {item.prompts.map((prompt, index) => (
              <div key={prompt} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  {index === 0 ? <Dumbbell className="size-6" /> : <FlameKindling className="size-6" />}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">{prompt}</p>
              </div>
            ))}
          </section>

          <div className="rounded-3xl bg-slate-950 p-4 text-sm leading-7 text-slate-100">
            <Activity className="mb-2 size-5 text-sky-300" />
            数据仅作康复监测和健康宣教参考，具体训练强度以医嘱、疼痛、肿胀和切口恢复情况为准。
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
