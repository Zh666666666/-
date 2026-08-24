"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, RefreshCw, Save, ShieldCheck, Stethoscope, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordCompleteness, type PatientRecordInput } from "@/lib/patient-record";
import type { PatientSummary, UserRole } from "@/lib/rehab";

type Props = { role: UserRole; patientId?: string; backHref?: string; standalone?: boolean };

function toDraft(patient: PatientSummary): PatientRecordInput {
  return {
    name: patient.name, gender: patient.gender, dateOfBirth: patient.dateOfBirth?.slice(0, 10) ?? null,
    ethnicity: patient.ethnicity, nativePlace: patient.nativePlace, nationality: patient.nationality,
    maritalStatus: patient.maritalStatus, occupation: patient.occupation, bloodType: patient.bloodType,
    phone: patient.phone, homeAddress: patient.homeAddress, emergencyContactName: patient.emergencyContactName,
    emergencyContactRelation: patient.emergencyContactRelation, emergencyContactPhone: patient.emergencyContactPhone,
    allergyStatus: patient.allergyStatus, allergyHistory: patient.allergyHistory,
    pastMedicalHistory: patient.pastMedicalHistory, surgicalHistory: patient.surgicalHistory,
    familyMedicalHistory: patient.familyMedicalHistory, medicationHistory: patient.medicationHistory,
    diagnosis: patient.diagnosis, surgeryDate: patient.surgeryDate.slice(0, 10), surgicalSide: patient.surgicalSide,
  };
}

export function PatientMedicalRecord({ role, patientId, backHref, standalone = false }: Props) {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [draft, setDraft] = useState<PatientRecordInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let id = patientId;
    if (!id) {
      const response = await fetch("/api/patients", { cache: "no-store" });
      const patients = await response.json() as PatientSummary[];
      if (!response.ok) throw new Error("无法读取患者档案。");
      id = patients[0]?.id;
    }
    if (!id) { setPatient(null); setDraft(null); return; }
    const response = await fetch(`/api/patients/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json() as PatientSummary & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "无法读取患者档案。");
    setPatient(data);
    if (!editing) setDraft(toDraft(data));
  }, [editing, patientId]);

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取患者档案。"));
    const timer = window.setInterval(() => { if (!editing) load().catch(() => undefined); }, 5000);
    const onFocus = () => { if (!editing) load().catch(() => undefined); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [editing, load]);

  const completeness = useMemo(() => draft ? recordCompleteness(draft) : 0, [draft]);

  function update<Key extends keyof PatientRecordInput>(key: Key, value: PatientRecordInput[Key]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setMessage(null); setError(null);
  }

  async function save() {
    if (!patient || !draft) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft),
      });
      const data = await response.json() as PatientSummary & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "患者档案保存失败。");
      setPatient(data); setDraft(toDraft(data)); setEditing(false);
      setMessage("患者档案已保存，家属端和主管护士端将读取同一份最新资料。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "患者档案保存失败。"); }
    finally { setBusy(false); }
  }

  if (!patient || !draft) {
    return <section className="rounded-lg border border-[var(--hairline)] bg-white p-5 shadow-e1">
      <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">{error ? <AlertTriangle className="size-5 text-amber-600" /> : <RefreshCw className="size-5 animate-spin" />}{error ?? "正在读取患者档案"}</div>
      {!error ? null : <p className="mt-2 text-xs leading-5 text-slate-500">尚未建档时，请先在下方创建患者档案；建档后此处会自动出现。</p>}
    </section>;
  }

  return <section className={standalone ? "min-h-screen bg-canvas px-4 pb-32 pt-5 md:px-10 md:pb-10" : ""}>
    <div className={standalone ? "mx-auto max-w-6xl space-y-5" : "space-y-5"}>
      <header className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" className="gap-2"><ClipboardList className="size-4" />统一患者档案</Badge>
            <Badge variant={patient.primaryNurseName ? "success" : "warning"}>{patient.primaryNurseName ? `主管护士：${patient.primaryNurseName}` : "待绑定主管护士"}</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">{patient.name} 的就诊与康复资料</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">按门诊常用要素整理。未确认的信息请选择“未知”，不要把空白当作“无”。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backHref ? <Button asChild variant="outline"><Link href={backHref}><ArrowLeft className="size-4" />返回</Link></Button> : null}
          <Button variant={editing ? "secondary" : "outline"} onClick={() => { setEditing((value) => !value); setDraft(toDraft(patient)); }}>{editing ? "取消编辑" : "编辑患者档案"}</Button>
          <Button disabled={!editing || busy} onClick={save}><Save className="size-4" />{busy ? "正在保存" : "保存并同步"}</Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${completeness}%` }} /></div>
        <p className="text-sm font-semibold text-slate-700">档案完整度 {completeness}%</p>
      </div>
      {message ? <Notice success>{message}</Notice> : null}{error ? <Notice>{error}</Notice> : null}

      <RecordSection icon={UserRound} title="身份与基本信息" helper="用于确认患者身份和基础情况；当前不采集完整身份证号等高敏标识">
        <Field label="患者姓名" value={draft.name} disabled={!editing} onChange={(v) => update("name", v)} />
        <Select label="性别" value={draft.gender ?? ""} disabled={!editing} onChange={(v) => update("gender", v ? v as PatientRecordInput["gender"] : null)} options={[["", "未知"], ["MALE", "男"], ["FEMALE", "女"], ["OTHER", "其他"]]} />
        <Field label="出生日期" type="date" value={draft.dateOfBirth ?? ""} disabled={!editing} onChange={(v) => update("dateOfBirth", v || null)} />
        <Field label="民族" value={draft.ethnicity ?? ""} disabled={!editing} onChange={(v) => update("ethnicity", v || null)} placeholder="如：汉族" />
        <Field label="籍贯" value={draft.nativePlace ?? ""} disabled={!editing} onChange={(v) => update("nativePlace", v || null)} placeholder="省 / 市" />
        <Field label="国籍" value={draft.nationality ?? ""} disabled={!editing} onChange={(v) => update("nationality", v || null)} />
        <Field label="婚姻状况" value={draft.maritalStatus ?? ""} disabled={!editing} onChange={(v) => update("maritalStatus", v || null)} />
        <Field label="职业" value={draft.occupation ?? ""} disabled={!editing} onChange={(v) => update("occupation", v || null)} />
        <Field label="血型" value={draft.bloodType ?? ""} disabled={!editing} onChange={(v) => update("bloodType", v || null)} placeholder="未知 / A / B / AB / O" />
      </RecordSection>

      <RecordSection icon={ShieldCheck} title="联系方式与紧急联系人" helper="紧急联系人建议至少填写姓名与电话">
        <Field label="患者电话" value={draft.phone ?? ""} disabled={!editing} onChange={(v) => update("phone", v || null)} />
        <Field label="居住地址" value={draft.homeAddress ?? ""} disabled={!editing} onChange={(v) => update("homeAddress", v || null)} className="md:col-span-2" />
        <Field label="紧急联系人姓名" value={draft.emergencyContactName ?? ""} disabled={!editing} onChange={(v) => update("emergencyContactName", v || null)} />
        <Field label="与患者关系" value={draft.emergencyContactRelation ?? ""} disabled={!editing} onChange={(v) => update("emergencyContactRelation", v || null)} />
        <Field label="紧急联系人电话" value={draft.emergencyContactPhone ?? ""} disabled={!editing} onChange={(v) => update("emergencyContactPhone", v || null)} />
      </RecordSection>

      <RecordSection icon={AlertTriangle} title="过敏史与健康史" helper="“无”和“尚未确认”含义不同，请如实选择">
        <Select label="过敏情况" value={draft.allergyStatus} disabled={!editing} onChange={(v) => update("allergyStatus", v as PatientRecordInput["allergyStatus"])} options={[["UNKNOWN", "尚未确认"], ["NONE", "明确无过敏史"], ["PRESENT", "有过敏史"]]} />
        <Area label="过敏药物或物质" value={draft.allergyHistory ?? ""} disabled={!editing || draft.allergyStatus !== "PRESENT"} onChange={(v) => update("allergyHistory", v || null)} />
        <Area label="既往病史" value={draft.pastMedicalHistory ?? ""} disabled={!editing} onChange={(v) => update("pastMedicalHistory", v || null)} placeholder="如高血压、糖尿病、心血管疾病等" />
        <Area label="既往手术史" value={draft.surgicalHistory ?? ""} disabled={!editing} onChange={(v) => update("surgicalHistory", v || null)} />
        <Area label="家族病史" value={draft.familyMedicalHistory ?? ""} disabled={!editing} onChange={(v) => update("familyMedicalHistory", v || null)} />
        <Area label="当前用药" value={draft.medicationHistory ?? ""} disabled={!editing} onChange={(v) => update("medicationHistory", v || null)} placeholder="药名、剂量、频次；不清楚可填写按医嘱服药" />
      </RecordSection>

      <RecordSection icon={Stethoscope} title="本次手术与康复信息" helper={role === "family" ? "请以出院记录和医嘱为准" : "护士修改后会同步到家属端"}>
        <Field label="诊断" value={draft.diagnosis} disabled={!editing} onChange={(v) => update("diagnosis", v)} className="md:col-span-2" />
        <Field label="手术日期" type="date" value={draft.surgeryDate} disabled={!editing} onChange={(v) => update("surgeryDate", v)} />
        <Select label="手术侧" value={draft.surgicalSide} disabled={!editing} onChange={(v) => update("surgicalSide", v as PatientRecordInput["surgicalSide"])} options={[["LEFT", "左膝"], ["RIGHT", "右膝"], ["BILATERAL", "双膝"]]} />
      </RecordSection>
    </div>
  </section>;
}

function RecordSection({ icon: Icon, title, helper, children }: { icon: typeof UserRound; title: string; helper: string; children: React.ReactNode }) {
  return <section className="border-b border-[var(--hairline)] pb-6 last:border-0"><div className="mb-4 flex items-start gap-3"><Icon className="mt-0.5 size-5 text-emerald-700" /><div><h3 className="font-semibold text-ink-900">{title}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{helper}</p></div></div><div className="grid gap-4 md:grid-cols-3">{children}</div></section>;
}
function Field({ label, value, onChange, disabled, type = "text", placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; type?: string; placeholder?: string; className?: string }) {
  return <label className={`space-y-2 ${className}`}><span className="text-sm font-semibold text-slate-600">{label}</span><Input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
function Select({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="space-y-2"><span className="text-sm font-semibold text-slate-600">{label}</span><select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:opacity-70" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function Area({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; placeholder?: string }) {
  return <label className="space-y-2"><span className="text-sm font-semibold text-slate-600">{label}</span><Textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
function Notice({ children, success = false }: { children: React.ReactNode; success?: boolean }) {
  return <p role={success ? undefined : "alert"} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{success ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}{children}</p>;
}
