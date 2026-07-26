"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, ChevronDown, Flower2, HeartHandshake, Home, Soup, Sparkles, Star, ThermometerSun, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tcmCareRituals = ["问感受：今天最难受的是哪里", "稳节奏：先少量多次，不硬撑", "护尊严：帮忙前先征得同意", "给盼头：记录一个比昨天好的地方"];

const knowledgeItems = [
  {
    title: "膝关节穴位按摩",
    subtitle: "血海、阳陵泉、足三里等穴位调护",
    icon: Sparkles,
    content: "术后稳定期可在专业人员指导下轻柔按揉血海、阳陵泉、足三里、阴陵泉等穴位。每处 1-2 分钟，以局部酸胀但不疼痛为宜，有助于改善局部气血运行、缓解肌肉紧张。切勿直接按压切口、红肿热痛区域或明显肿胀部位。",
    careTip: "陪护提示：按摩前先把手搓热，问一句“这个力度可以吗”，让家人觉得被尊重而不是被摆弄。",
  },
  {
    title: "热敷与中药熏洗",
    subtitle: "温通经络，注意避开急性肿胀期",
    icon: ThermometerSun,
    content: "热敷和中药熏洗适合切口愈合良好、无明显发热红肿时使用。可选择温热毛巾或遵医嘱使用活血通络类熏洗方，温度以 38-42℃ 为宜，每次 15-20 分钟。若出现疼痛加重、皮肤发红或渗液，应立即停止。",
    careTip: "陪护提示：热敷时每 5 分钟看一次皮肤颜色，顺便陪家人聊几句，缓解等待时的紧张。",
  },
  {
    title: "食疗推荐",
    subtitle: "杜仲、桑寄生、黑豆、山药等调养思路",
    icon: Soup,
    content: "康复期饮食宜重视优质蛋白、钙质和健脾益肾类食材。可在医生指导下搭配杜仲、桑寄生、黑豆、山药、枸杞等食材煲汤。合并高血压、糖尿病、肾病或正在服药者，应先咨询医生，避免药食冲突。",
    careTip: "陪护提示：不要用“多吃才恢复快”施压，可以说“今天先吃一点舒服的，我们慢慢补回来”。",
  },
  {
    title: "情志调养",
    subtitle: "稳定情绪，减少疼痛敏感和康复焦虑",
    icon: HeartHandshake,
    content: "术后疼痛和活动受限容易引发焦虑，建议保持规律作息、适度晒太阳、进行腹式呼吸和舒缓音乐放松。家属可每日给予正向反馈，帮助患者记录角度进步和训练完成情况，增强康复信心。",
    careTip: "陪护提示：家人说“我是不是恢复得太慢”时，先回应情绪，再谈训练：“你已经很努力了，我们把今天能做的一点点做好。”",
  },
  {
    title: "功能锻炼注意事项",
    subtitle: "循序渐进，避免暴力压腿和过度训练",
    icon: Waves,
    content: "功能锻炼应遵循少量多次、循序渐进原则。坐位屈膝、踝泵、股四头肌等长收缩需按护士指导执行。疼痛超过 6 分、膝关节明显肿胀或训练后持续不适时，应减少强度并联系医护人员。",
    careTip: "陪护提示：训练时少催促、多陪数节奏，看到皱眉或屏气就停下来问感受。",
  },
  {
    title: "日常起居调护",
    subtitle: "防跌倒、防受凉，保持居家动线安全",
    icon: Home,
    content: "居家环境应保持地面干燥、防滑，夜间预留照明，常用物品放在易取位置。膝部注意保暖但避免长时间高温刺激。上下楼梯遵循健侧先上、患侧先下的原则，必要时使用助行器或扶手。",
    careTip: "陪护提示：把安全改造说成“让家里更好走”，不要让家人觉得自己成了负担。",
  },
];

export default function TcmKnowledgePage() {
  const [openIndex, setOpenIndex] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [learned, setLearned] = useState<string[]>([]);

  function toggle(list: string[], setList: (value: string[]) => void, title: string) {
    setList(list.includes(title) ? list.filter((item) => item !== title) : [...list, title]);
  }

  const filteredItems = knowledgeItems.filter((item) => {
    if (filter === "FAVORITE") {
      return favorites.includes(item.title);
    }

    if (filter === "LEARNED") {
      return learned.includes(item.title);
    }

    return true;
  });

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-6xl space-y-5 md:space-y-6">
        <header className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-amber-50 p-5 shadow-sm md:rounded-2xl md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
                <Flower2 className="size-4" />
                中医康复知识专区
              </Badge>
              <h1 className="mt-5 font-display text-3xl font-medium tracking-tight md:text-6xl">TKA 术后中医康复调护</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg md:leading-9">内容用于康复宣教和日常调护参考，也提醒家属在照护身体的同时照护情绪。具体治疗方案需结合医嘱、切口恢复情况和个人体质。</p>
            </div>
            <Button asChild size="lg" variant="outline">
              <Link href="/family">返回家属端</Link>
            </Button>
          </div>
        </header>

        <Card className="overflow-hidden border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:p-6">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700">
              <HeartHandshake className="size-7" />
            </div>
            <div>
              <Badge variant="warning" className="w-fit">护理师寄语</Badge>
              <p className="mt-3 text-lg leading-8 text-slate-700">今天慢一点没有关系，恢复本来就是一段需要耐心的路。每一次主动屈膝、每一次坚持打卡，都是在帮家人更稳地走向康复。</p>
              <p className="mt-2 text-sm font-semibold text-emerald-800">虚拟护士 · 小暖</p>
            </div>
            <div className="rounded-3xl bg-white/80 px-4 py-3 text-sm leading-7 text-slate-600 shadow-sm">
              我们会陪您一起守护家人的每一次进步。
            </div>
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-white/90">
          <CardContent className="grid gap-3 p-5 md:grid-cols-4 md:p-6">
            {tcmCareRituals.map((item) => (
              <div key={item} className="rounded-3xl bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-950">
                <p className="font-semibold">{item.split("：")[0]}</p>
                <p className="mt-1">{item.split("：")[1]}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-white/90">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <Button size="sm" variant={filter === "ALL" ? "elder" : "outline"} onClick={() => setFilter("ALL")}>全部 {knowledgeItems.length}</Button>
              <Button size="sm" variant={filter === "FAVORITE" ? "elder" : "outline"} onClick={() => setFilter("FAVORITE")}><Star className="size-4" />收藏 {favorites.length}</Button>
              <Button size="sm" variant={filter === "LEARNED" ? "elder" : "outline"} onClick={() => setFilter("LEARNED")}><BookOpenCheck className="size-4" />已学习 {learned.length}</Button>
            </div>
            <p className="text-sm font-semibold text-slate-500">学习进度 {learned.length}/{knowledgeItems.length}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const index = knowledgeItems.findIndex((entry) => entry.title === item.title);
            const Icon = item.icon;
            const open = openIndex === index;
            const favored = favorites.includes(item.title);
            const done = learned.includes(item.title);

            return (
              <Card key={item.title} className={cn("bg-white/90 transition-all", open ? "border-emerald-300 shadow-xl shadow-emerald-950/10" : "hover:border-emerald-200")}>
                <button className="w-full text-left" onClick={() => setOpenIndex(open ? -1 : index)}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <Icon className="size-6" />
                      </span>
                      <div className="flex items-center gap-2">
                        {favored ? <Badge variant="warning">已收藏</Badge> : null}
                        {done ? <Badge variant="success">已学习</Badge> : null}
                        <ChevronDown className={cn("size-5 text-slate-400 transition-transform", open ? "rotate-180" : "")} />
                      </div>
                    </div>
                    <CardTitle className="text-2xl">{item.title}</CardTitle>
                    <p className="text-sm leading-6 text-slate-500">{item.subtitle}</p>
                  </CardHeader>
                </button>
                {open ? (
                  <CardContent className="space-y-4">
                    <p className="rounded-3xl bg-emerald-50 p-5 text-base leading-8 text-emerald-950">{item.content}</p>
                    <p className="rounded-3xl bg-rose-50 p-5 text-base leading-8 text-rose-950">{item.careTip}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant={favored ? "secondary" : "outline"} onClick={() => toggle(favorites, setFavorites, item.title)}>
                        <Star className="size-4" />
                        {favored ? "取消收藏" : "收藏"}
                      </Button>
                      <Button variant={done ? "elder" : "outline"} onClick={() => toggle(learned, setLearned, item.title)}>
                        <BookOpenCheck className="size-4" />
                        {done ? "已学习" : "标记已学习"}
                      </Button>
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
