"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, History, KeyRound, LogOut, Save, ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PatientAccessManager } from "@/components/patient-access-manager";
import { PatientMedicalRecord } from "@/components/patient-medical-record";
import type { ProfileItem, UserRole } from "@/lib/rehab";

type ProfileFormProps = { role: UserRole; title: string; backHref: string };
type Draft = Pick<ProfileItem, "role" | "name" | "phone" | "department" | "title" | "relationToPatient" | "notificationPreference">;

const defaults: Record<UserRole, Draft> = {
  family: { role: "family", name: "", phone: "", department: null, title: null, relationToPatient: "", notificationPreference: "IMPORTANT_ONLY" },
  nurse: { role: "nurse", name: "", phone: "", department: "", title: "", relationToPatient: null, notificationPreference: "ALL" },
};

export function ProfileForm({ role, title, backHref }: ProfileFormProps) {
  const [profile, setProfile] = useState<Draft>(defaults[role]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<ProfileItem | null> : null)
      .then((data) => {
        if (!data) return;
        setProfile({
          role: data.role,
          name: data.name,
          phone: data.phone,
          department: data.department,
          title: data.title,
          relationToPatient: data.relationToPatient ?? "",
          notificationPreference: data.notificationPreference ?? "IMPORTANT_ONLY",
        });
      });
  }, []);

  function update<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json() as ProfileItem & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "资料保存失败");
      setMessage("资料已保存");
      setEditing(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "资料保存失败");
    } finally { setSaving(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setPasswordBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json() as { error?: string; requiresReauthentication?: boolean };
      if (!response.ok) throw new Error(data.error ?? "密码修改失败");
      setCurrentPassword(""); setNewPassword("");
      if (data.requiresReauthentication) {
        window.location.assign("/login");
        return;
      }
      setMessage("密码修改成功，下次登录请使用新密码");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "密码修改失败");
    } finally { setPasswordBusy(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <main className="rehab-grid min-h-screen px-4 pb-32 pt-5 text-slate-950 md:px-10 md:pb-10">
      <section className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-e2 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <Badge variant="success" className="gap-2"><UserRound className="size-4" />{role === "family" ? "家属账号" : "护士账号"}</Badge>
            <h1 className="display-md mt-3 text-2xl md:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {role === "family" ? "账号联系人资料与患者病历分开保存；下方患者档案会与主管护士共享。" : "维护你的联系方式和工作信息；你只会看到由归属码绑定给你的患者。"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href={backHref}>返回工作台</Link></Button>
            <Button variant="outline" onClick={logout}><LogOut className="size-4" />退出登录</Button>
          </div>
        </header>

        {message ? <p className="flex items-center gap-2 rounded-lg border border-[rgba(47,125,92,0.20)] bg-[var(--success-soft)] px-3.5 py-2.5 text-[0.8125rem] font-medium leading-5 text-emerald-800"><CheckCircle2 className="size-4 shrink-0" />{message}</p> : null}

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="bg-white/95">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><UserRound className="size-6 text-emerald-700" />基本资料</CardTitle>
              <Button variant={editing ? "secondary" : "outline"} onClick={() => setEditing((value) => !value)}>{editing ? "取消" : "编辑"}</Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label={role === "family" ? "账号使用人姓名" : "护士姓名"} value={profile.name} disabled={!editing} onChange={(value) => update("name", value)} />
              <Field label="联系电话" value={profile.phone ?? ""} disabled={!editing} onChange={(value) => update("phone", value)} />
              {role === "family" ? <>
                <Field label="与患者关系" value={profile.relationToPatient ?? ""} disabled={!editing} onChange={(value) => update("relationToPatient", value)} />
                <SelectField label="消息通知" value={profile.notificationPreference ?? "IMPORTANT_ONLY"} disabled={!editing} onChange={(value) => update("notificationPreference", value)} options={[
                  ["IMPORTANT_ONLY", "只通知需要关注的情况"],
                  ["ALL", "全部训练与提醒"],
                  ["NONE", "暂不接收通知"],
                ]} />
              </> : <>
                <Field label="科室" value={profile.department ?? ""} disabled={!editing} onChange={(value) => update("department", value)} />
                <Field label="职称" value={profile.title ?? ""} disabled={!editing} onChange={(value) => update("title", value)} />
              </>}
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={save} disabled={!editing || saving}><Save className="size-4" />{saving ? "正在保存" : "保存资料"}</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="bg-white/95">
              <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-6 text-emerald-700" />账号安全</CardTitle></CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={changePassword}>
                  <Field label="当前密码" type="password" value={currentPassword} disabled={false} onChange={setCurrentPassword} />
                  <Field label="新密码" type="password" value={newPassword} disabled={false} onChange={setNewPassword} />
                  <p className="text-xs text-slate-500">至少 12 位，包含字母和数字。</p>
                  <Button className="w-full" variant="outline" disabled={passwordBusy}>{passwordBusy ? "正在修改" : "修改密码"}</Button>
                </form>
              </CardContent>
            </Card>

            <Card className="bg-white/95">
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-6 text-emerald-700" />常用功能</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                <Button asChild variant="outline" className="justify-start"><Link href={`${backHref}/history`}><History className="size-4" />查看训练历史</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link href="/appointments"><Bell className="size-4" />预约与提醒</Link></Button>
                <div className="mt-2 flex items-start gap-2 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />患者身份、过敏史和既往史保存在统一档案中；主管护士与家属读取的是同一份最新资料。</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {role === "family" ? <PatientMedicalRecord role="family" /> : null}
        <PatientAccessManager role={role} />
      </section>
    </main>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }: { label: string; value: string; disabled: boolean; type?: string; onChange: (value: string) => void }) {
  return <label className="space-y-2"><span className="text-sm font-semibold text-slate-600">{label}</span><Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<[string, string]>; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="space-y-2"><span className="text-sm font-semibold text-slate-600">{label}</span><select className="h-11 w-full border border-slate-200 bg-white px-3 text-sm disabled:opacity-50" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
