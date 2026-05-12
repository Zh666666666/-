"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Save, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { subscribeToSharedTables, removeRealtimeChannel } from "@/lib/realtime";
import type { ProfileItem, UserRole } from "@/lib/rehab";
import { supabase } from "@/lib/supabase";

type ProfileFormProps = {
  role: UserRole;
  title: string;
  backHref: string;
};

type ProfileDraft = Omit<ProfileItem, "id" | "userId" | "createdAt" | "updatedAt">;

const blankPatient: ProfileDraft = {
  role: "patient",
  name: "",
  age: null,
  gender: "FEMALE",
  tkaSurgeryDate: null,
  affectedKnee: "RIGHT",
  phone: "",
  emergencyContact: "",
  sensorDeviceId: "",
  department: null,
  title: null,
};

const blankNurse: ProfileDraft = {
  role: "nurse",
  name: "",
  age: null,
  gender: null,
  tkaSurgeryDate: null,
  affectedKnee: null,
  phone: "",
  emergencyContact: null,
  sensorDeviceId: null,
  department: "",
  title: "",
};

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function ProfileForm({ role, title, backHref }: ProfileFormProps) {
  const [profile, setProfile] = useState<ProfileDraft>(role === "patient" ? blankPatient : blankNurse);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/profile?role=${role}`, { cache: "no-store" });
      const data = (await response.json()) as ProfileItem | null;

      if (!cancelled && data) {
        setProfile({
          role: data.role,
          name: data.name,
          age: data.age,
          gender: data.gender,
          tkaSurgeryDate: data.tkaSurgeryDate,
          affectedKnee: data.affectedKnee,
          phone: data.phone,
          emergencyContact: data.emergencyContact,
          sensorDeviceId: data.sensorDeviceId,
          department: data.department,
          title: data.title,
        });
      }
    }

    load();

    if (!supabase) {
      const timer = window.setInterval(load, 3500);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }

    const channel = subscribeToSharedTables(`profile-${role}`, load, ["profiles"]);

    return () => {
      cancelled = true;
      removeRealtimeChannel(channel);
    };
  }, [role]);

  function update<Key extends keyof ProfileDraft>(key: Key, value: ProfileDraft[Key]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);

    try {
      const payload = {
        ...profile,
        age: profile.age === null ? null : Number(profile.age),
        tkaSurgeryDate: profile.tkaSurgeryDate ? toDateInput(profile.tkaSurgeryDate) : null,
      };

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Profile save failed");
      }

      const data = (await response.json()) as ProfileItem;
      setProfile({
        role: data.role,
        name: data.name,
        age: data.age,
        gender: data.gender,
        tkaSurgeryDate: data.tkaSurgeryDate,
        affectedKnee: data.affectedKnee,
        phone: data.phone,
        emergencyContact: data.emergencyContact,
        sensorDeviceId: data.sensorDeviceId,
        department: data.department,
        title: data.title,
      });
      setSaved(true);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-40 pt-4 text-slate-950 md:px-10 md:pb-10 md:pt-6">
      <section className="mx-auto max-w-4xl space-y-5 md:space-y-6">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-emerald-100 bg-white/90 p-5 shadow-sm md:rounded-[2rem] md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant="success" className="gap-2 px-3 py-1 text-sm">
              <UserRound className="size-4" />
              {role === "patient" ? "患者档案" : "护士档案"}
            </Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">{title}</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">支持查看与编辑，保存后写入数据库；未配置 Supabase 实时通道时使用 Demo 轮询。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <Button asChild variant="outline">
              <Link href={backHref}>返回</Link>
            </Button>
            <Button variant={editing ? "secondary" : "elder"} onClick={() => setEditing((value) => !value)}>
              {editing ? "取消编辑" : "编辑资料"}
            </Button>
          </div>
        </header>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <UserRound className="size-7 text-emerald-700" />
              基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="姓名" value={profile.name} disabled={!editing} onChange={(value) => update("name", value)} />
            <Field label="联系电话" value={profile.phone ?? ""} disabled={!editing} onChange={(value) => update("phone", value)} />

            {role === "patient" ? (
              <>
                <Field label="年龄" type="number" value={profile.age?.toString() ?? ""} disabled={!editing} onChange={(value) => update("age", value ? Number(value) : null)} />
                <SelectField label="性别" value={profile.gender ?? ""} disabled={!editing} onChange={(value) => update("gender", value as ProfileDraft["gender"])} options={["MALE", "FEMALE", "OTHER"]} labels={{ MALE: "男", FEMALE: "女", OTHER: "其他" }} />
                <Field label="TKA 手术日期" type="date" value={toDateInput(profile.tkaSurgeryDate)} disabled={!editing} onChange={(value) => update("tkaSurgeryDate", value || null)} />
                <SelectField label="患膝" value={profile.affectedKnee ?? ""} disabled={!editing} onChange={(value) => update("affectedKnee", value as ProfileDraft["affectedKnee"])} options={["LEFT", "RIGHT", "BILATERAL"]} labels={{ LEFT: "左膝", RIGHT: "右膝", BILATERAL: "双膝" }} />
                <Field label="紧急联系人" value={profile.emergencyContact ?? ""} disabled={!editing} onChange={(value) => update("emergencyContact", value)} />
                <Field label="当前传感器设备 ID" value={profile.sensorDeviceId ?? ""} disabled={!editing} onChange={(value) => update("sensorDeviceId", value)} />
              </>
            ) : (
              <>
                <Field label="科室" value={profile.department ?? ""} disabled={!editing} onChange={(value) => update("department", value)} />
                <Field label="职称" value={profile.title ?? ""} disabled={!editing} onChange={(value) => update("title", value)} />
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {saved ? <span className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-4" />资料已保存</span> : null}
          <Button size="lg" variant="elder" onClick={save} disabled={!editing || saving}>
            <Save className="size-5" />
            {saving ? "正在保存" : "保存资料"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }: { label: string; value: string; disabled: boolean; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, labels, onChange, disabled }: { label: string; value: string; options: string[]; labels: Record<string, string>; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <select className="flex h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm disabled:opacity-50 md:h-11 md:rounded-xl md:px-3 md:py-2 md:text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option]}</option>
        ))}
      </select>
    </label>
  );
}
