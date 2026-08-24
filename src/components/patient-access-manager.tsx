"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, FilePlus2, Link2, Link2Off, RefreshCw, ShieldCheck, TicketCheck, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PatientSummary, UserRole } from "@/lib/rehab";

type FamilyAccess = {
  role: "family";
  linked: boolean;
  patient: PatientSummary | null;
  recentAudits: Array<{ id: string; action: string; createdAt: string }>;
};

type NurseAccess = {
  role: "nurse";
  patient: PatientSummary | null;
  linkedProfiles: Array<{ id: string; name: string; relationToPatient: string | null; updatedAt: string }>;
  invitations: Array<{ id: string; status: string; expiresAt: string; createdAt: string; acceptedAt: string | null }>;
  recentAudits: Array<{ id: string; action: string; actorRole: UserRole; createdAt: string }>;
};

const actionLabels: Record<string, string> = {
  SELF_CREATED: "已自助创建并关联档案",
  INVITE_CREATED: "护士创建了关联码",
  INVITE_ACCEPTED: "家属确认了档案关联",
  INVITE_REVOKED: "护士撤销了未使用的关联码",
  FAMILY_UNLINKED: "家属解除了档案关联",
  NURSE_REVOKED: "护士撤销了档案关联",
  MIGRATED: "既有授权已纳入审计",
  PATIENT_UPDATED: "患者病历资料已更新",
  NURSE_ASSIGNED: "已绑定主管护士",
  NURSE_RELEASED: "主管护士已发起移交",
};

async function requestPatientAccess(body: object) {
  const response = await fetch("/api/patient-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(data.error ?? "操作失败，请稍后重试。");
  return data;
}

export function PatientAccessManager({ role }: { role: UserRole }) {
  return role === "family" ? <FamilyPatientAccess /> : <NursePatientAccess />;
}

function FamilyPatientAccess() {
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [mode, setMode] = useState<"create" | "code">("create");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [form, setForm] = useState({
    patientName: "",
    age: "",
    surgeryDate: "",
    surgicalSide: "RIGHT",
    relationToPatient: "本人",
  });

  const load = useCallback(async () => {
    const response = await fetch("/api/patient-access", { cache: "no-store" });
    const data = await response.json() as FamilyAccess & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "无法读取康复档案状态。");
    if (data.role !== "family") throw new Error("账号角色已变化，请刷新页面后重试。");
    setAccess(data);
  }, []);

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取康复档案状态。"));
  }, [load]);

  async function submit(body: object, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await requestPatientAccess(body);
      await load();
      setMessage(success);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (!access) {
    return <Card className="bg-white/95"><CardContent className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-600"><RefreshCw className="size-4 animate-spin" />正在读取康复档案</CardContent></Card>;
  }

  return (
    <Card className="bg-white/95">
      <CardHeader className="gap-2">
        <Badge variant={access.linked ? "success" : "warning"} className="w-fit gap-2">
          {access.linked ? <ShieldCheck className="size-4" /> : <Link2 className="size-4" />}
          {access.linked ? "档案授权有效" : "尚未建立康复档案"}
        </Badge>
        <CardTitle className="flex items-center gap-2"><TicketCheck className="size-6 text-emerald-700" />我的康复档案</CardTitle>
        <p className="text-sm leading-6 text-slate-600">
          {access.linked ? "这个账号只能查看下方患者的数据；所有关联和撤销都会留下记录。" : "创建家人的新档案，或输入护士提供的一次性关联码。系统不会根据邮箱自动猜测患者。"}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        {access.linked && access.patient ? (
          <>
            <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-4">
              <Data label="患者姓名" value={access.patient.name} />
              <Data label="年龄" value={`${access.patient.age} 岁`} />
              <Data label="手术侧" value={sideLabel(access.patient.surgicalSide)} />
              <Data label="建档编号" value={access.patient.medicalRecordNo} />
            </div>
            {!access.patient.primaryNurseName ? <section className="border-y border-amber-200 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-950">绑定主管护士</h3>
              <p className="mt-1 text-xs leading-5 text-amber-800">向负责你的护士获取一次性归属码。绑定后，只有这名主管护士能在护士端看到本档案。</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input value={inviteCode} maxLength={9} placeholder="例如 ABCD-23EF" className="tabular uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} />
                <Button disabled={busy || inviteCode.length < 8} onClick={() => submit({ action: "ACCEPT_INVITE", confirmed: true, code: inviteCode }, "主管护士已绑定。")}>确认绑定</Button>
              </div>
            </section> : <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><ShieldCheck className="size-4" />本档案由 {access.patient.primaryNurseName} 负责，其他护士无法查看。</p>}
            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">{access.patient.primaryNurseName ? "患者与主管护士已形成强归属；需要更换护士时，请由当前主管护士发起移交。" : "尚未绑定主管护士时，可以解除当前账号与患者档案的关联。"}</p>
              {!access.patient.primaryNurseName ? <Dialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
                <DialogTrigger asChild><Button variant="outline" className="text-red-700"><Link2Off className="size-4" />解除关联</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>确认解除康复档案关联？</DialogTitle>
                    <DialogDescription>解除后将立即看不到 {access.patient.name} 的训练和设备数据，但不会删除任何历史记录。</DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setUnlinkOpen(false)}>取消</Button>
                    <Button variant="destructive" disabled={busy} onClick={async () => {
                      await submit({ action: "FAMILY_UNLINK", confirmed: true }, "档案关联已解除。");
                      setUnlinkOpen(false);
                    }}>确认解除</Button>
                  </div>
                </DialogContent>
              </Dialog> : null}
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="建档方式">
              <button type="button" onClick={() => { setMode("create"); setConfirmed(false); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === "create" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><FilePlus2 className="mr-2 inline size-4" />创建新档案</button>
              <button type="button" onClick={() => { setMode("code"); setConfirmed(false); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === "code" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><Link2 className="mr-2 inline size-4" />使用关联码</button>
            </div>

            {mode === "create" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="患者姓名"><Input value={form.patientName} onChange={(event) => setForm((current) => ({ ...current, patientName: event.target.value }))} /></Field>
                <Field label="年龄"><Input type="number" min={1} max={120} value={form.age} onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))} /></Field>
                <Field label="手术日期"><Input type="date" max={new Date().toISOString().slice(0, 10)} value={form.surgeryDate} onChange={(event) => setForm((current) => ({ ...current, surgeryDate: event.target.value }))} /></Field>
                <Field label="手术侧"><select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.surgicalSide} onChange={(event) => setForm((current) => ({ ...current, surgicalSide: event.target.value }))}><option value="LEFT">左膝</option><option value="RIGHT">右膝</option><option value="BILATERAL">双膝</option></select></Field>
                <Field label="我与患者的关系"><select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.relationToPatient} onChange={(event) => setForm((current) => ({ ...current, relationToPatient: event.target.value }))}><option>本人</option><option>配偶</option><option>子女</option><option>父母</option><option>其他家属</option></select></Field>
              </div>
            ) : (
              <Field label="护士提供的 8 位关联码" hint="关联码仅可使用一次，有效期 48 小时。">
                <Input value={inviteCode} maxLength={9} placeholder="例如 ABCD-23EF" className="tabular uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} />
              </Field>
            )}

            <Confirm checked={confirmed} onChange={setConfirmed}>
              我已核对患者身份，并同意将这个账号用于查看其康复、设备和训练记录。
            </Confirm>
            <Button disabled={busy || !confirmed} onClick={() => mode === "create"
              ? submit({ action: "SELF_CREATE", confirmed, ...form, age: Number(form.age) }, "康复档案已创建并完成关联。")
              : submit({ action: "ACCEPT_INVITE", confirmed, code: inviteCode }, "已通过护士授权关联康复档案。")}
            >{mode === "create" ? <FilePlus2 className="size-4" /> : <Link2 className="size-4" />}{busy ? "正在处理" : mode === "create" ? "确认创建并关联" : "确认关联档案"}</Button>
          </>
        )}

        {access.recentAudits.length > 0 ? (
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-700">最近授权记录</p>
            <div className="mt-2 space-y-2">{access.recentAudits.slice(0, 4).map((item) => <p key={item.id} className="flex justify-between gap-4 text-xs text-slate-500"><span>{actionLabels[item.action] ?? item.action}</span><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></p>)}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NursePatientAccess() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState("");
  const [access, setAccess] = useState<NurseAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as PatientSummary[];
      if (!response.ok) throw new Error("无法读取患者列表。");
      setPatients(data);
      setPatientId((current) => current || data[0]?.id || "");
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取患者列表。"));
  }, []);

  const load = useCallback(async () => {
    const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    const response = await fetch(`/api/patient-access${query}`, { cache: "no-store" });
    const data = await response.json() as NurseAccess & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "无法读取授权状态。");
    if (data.role !== "nurse") throw new Error("账号角色已变化，请刷新页面后重试。");
    setAccess(data);
  }, [patientId]);

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取授权状态。")); }, [load]);

  async function generateCode() {
    setBusy(true); setError(null); setMessage(null); setNewCode(null);
    try {
      const data = await requestPatientAccess({ action: "CREATE_INVITE", confirmed });
      setNewCode(String(data.code));
      setConfirmed(false);
      setMessage("一次性主管护士归属码已生成，请通过可信渠道交给对应患者。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "关联码生成失败。");
    } finally { setBusy(false); }
  }

  async function revoke(profileId: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await requestPatientAccess({ action: "NURSE_REVOKE", confirmed: true, patientId, profileId });
      setMessage("家属访问权限已撤销，历史患者数据保持不变。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销失败。");
    } finally { setBusy(false); }
  }

  async function revokeInvitation(invitationId: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await requestPatientAccess({ action: "REVOKE_INVITE", confirmed: true, ...(patientId ? { patientId } : {}), invitationId });
      setMessage("未使用的关联码已撤销。");
      setNewCode(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销失败。");
    } finally { setBusy(false); }
  }

  async function releasePatient() {
    if (!patientId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await requestPatientAccess({ action: "NURSE_RELEASE", confirmed: true, patientId });
      setPatients((current) => current.filter((patient) => patient.id !== patientId));
      setPatientId(""); setAccess(null);
      setMessage("患者已解除主管护士归属，可使用另一名护士的新归属码完成移交。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移交失败。"); }
    finally { setBusy(false); }
  }

  return (
    <Card className="bg-white/95">
      <CardHeader className="gap-2">
        <Badge variant="success" className="w-fit gap-2"><ShieldCheck className="size-4" />主管护士归属管理</Badge>
        <CardTitle className="flex items-center gap-2"><UserPlus className="size-6 text-emerald-700" />我的患者与一次性归属码</CardTitle>
        <p className="text-sm leading-6 text-slate-600">患者输入你生成的归属码后会进入你的患者列表。一名患者只能有一名主管护士，你也只能查看自己负责的患者。</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="border-b border-slate-200 pb-5">
          <h3 className="font-semibold text-slate-900">生成主管护士归属码</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">有效期 48 小时，仅能由一名已经建档的患者使用。</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Confirm checked={confirmed} onChange={setConfirmed}>我确认由本人负责接收并管理使用此码绑定的患者。</Confirm>
            <Button disabled={!confirmed || busy} onClick={generateCode}><TicketCheck className="size-4" />生成归属码</Button>
          </div>
          {newCode ? <div className="mt-3 flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 p-3"><strong className="tabular text-xl tracking-widest text-emerald-800">{newCode}</strong><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(newCode); setMessage("归属码已复制。"); }}><Clipboard className="size-4" />复制</Button></div> : null}
        </section>
        <Field label="选择我负责的患者"><select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={patientId} onChange={(event) => { setPatientId(event.target.value); setMessage(null); }}><option value="">请选择患者</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.medicalRecordNo}</option>)}</select></Field>
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        {patientId ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="font-semibold text-slate-900">患者归属</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">当前患者由你负责。需要换护士时，必须先明确解除，再由新护士生成归属码。</p>
              <Button className="mt-4 text-red-700" variant="outline" disabled={busy} onClick={releasePatient}><Link2Off className="size-4" />解除并准备移交</Button>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">当前家属权限</h3>
              <div className="mt-3 space-y-3">
                {access?.linkedProfiles?.length ? access.linkedProfiles.map((profile) => (
                  <div key={profile.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div><p className="font-medium text-slate-800">{profile.name}</p><p className="text-xs text-slate-500">{profile.relationToPatient || "关系未填写"}</p></div>
                    <Dialog>
                      <DialogTrigger asChild><Button variant="outline" size="sm" className="text-red-700"><Link2Off className="size-4" />撤销</Button></DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>撤销 {profile.name} 的访问权限？</DialogTitle><DialogDescription>该账号会立即失去当前患者数据访问权，历史患者数据不会删除，操作会写入审计记录。</DialogDescription></DialogHeader>
                        <div className="flex justify-end"><Button variant="destructive" disabled={busy} onClick={() => revoke(profile.id)}>确认撤销</Button></div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )) : <p className="text-sm text-slate-500">当前没有已授权的家属账号。</p>}
              </div>
            </section>
          </div>
        ) : null}

        {access?.invitations?.length ? <div className="border-t border-slate-200 pt-4"><p className="text-sm font-semibold text-slate-700">最近关联码记录</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{access.invitations.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><span><span className="block font-medium text-slate-700">{invitationStatusLabel(item.status)}</span><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></span>{item.status === "PENDING" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => revokeInvitation(item.id)} className="text-red-700">撤销</Button> : null}</div>)}</div></div> : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="text-sm font-semibold text-slate-600">{label}</span>{children}{hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}</label>;
}

function Confirm({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"><input type="checkbox" className="mt-1 size-4 accent-emerald-700" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{children}</span></label>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 break-words font-semibold text-slate-900">{value}</p></div>;
}

function Notice({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return <p role={tone === "error" ? "alert" : undefined} className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{tone === "success" ? <Check className="size-4" /> : <Link2Off className="size-4" />}{children}</p>;
}

function sideLabel(side: PatientSummary["surgicalSide"]) {
  return side === "LEFT" ? "左膝" : side === "RIGHT" ? "右膝" : "双膝";
}

function invitationStatusLabel(status: string) {
  return status === "PENDING" ? "等待家属确认" : status === "ACCEPTED" ? "已确认使用" : status === "REVOKED" ? "已撤销" : "已过期";
}
