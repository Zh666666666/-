"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCopy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Credential = { id: string; label: string; expiresAt: string; revokedAt: string | null; deviceSerials: string[] };

export function GatewayCredentials({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<Credential[]>([]);
  const [label, setLabel] = useState("采集手机");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/gateway/credentials?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("采集凭据读取失败");
    setItems(await response.json());
  }, [patientId]);
  useEffect(() => { setToken(""); setItems([]); void load().catch((e: Error) => setError(e.message)); }, [load]);
  async function mutate(id?: string) {
    setBusy(true); setError(""); setToken("");
    try {
      const response = await fetch("/api/gateway/credentials", {
        method: id ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { patientId, id } : { patientId, label }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      if (data.token) setToken(data.token);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto my-6 max-w-6xl space-y-4 border-t p-4 md:p-6">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><KeyRound className="size-5" />采集手机授权</h2>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1">手机名称<Input maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <Button disabled={busy || !label.trim()} onClick={() => void mutate()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}生成采集凭据</Button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {token && <div className="space-y-2" role="status">
      <p>新凭据仅显示本次。请填入 App 的 Token，90 天内有效；更换设备后请重新签发。</p>
      <code className="block break-all rounded border p-3">{token}</code>
      <Button variant="outline" onClick={() => void navigator.clipboard.writeText(token).catch(() => setError("复制失败，请手动选择凭据"))}><ClipboardCopy className="size-4" />复制凭据</Button>
    </div>}
    <ul className="divide-y">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0"><strong>{item.label}</strong><p className="break-all text-sm text-muted-foreground">{item.deviceSerials.join(" · ")}</p>
        <p className="text-sm">{item.revokedAt ? "已撤销" : `有效期至 ${new Date(item.expiresAt).toLocaleDateString("zh-CN")}`}</p></div>
      {!item.revokedAt && <Button variant="outline" disabled={busy} onClick={() => void mutate(item.id)}><Trash2 className="size-4" />撤销</Button>}
    </li>)}</ul>
  </section>;
}
