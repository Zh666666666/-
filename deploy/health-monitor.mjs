import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function endpoint(value, allowHttp = false) {
  const url = new URL(value);
  if (url.username || url.password || url.hash ||
      (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:"))) {
    throw new Error("Invalid endpoint configuration");
  }
  return url;
}

async function jsonResponse(response) {
  if (response.status !== 200) throw new Error("Unhealthy response");
  // Bound response size while retaining the fetch timeout through body reads.
  let body = "";
  for await (const chunk of response.body) {
    body += Buffer.from(chunk).toString("utf8");
    if (body.length > 65536) throw new Error("Oversized response");
  }
  return JSON.parse(body);
}

export async function runMonitor(env = process.env, fetcher = fetch) {
  const issues = [];
  const now = Date.now();
  const timeout = Number(env.TKA_MONITOR_TIMEOUT_MS ?? 10000);
  const maxAge = Number(env.TKA_BACKUP_MAX_AGE_HOURS ?? 26) * 3600000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000 ||
      !Number.isFinite(maxAge) || maxAge <= 0 || maxAge > 168 * 3600000) {
    return { ok: false, issues: ["monitor-configuration"] };
  }
  const offsite = env.TKA_OFFSITE_BACKUP ?? "disabled";
  if (!["disabled", "restic"].includes(offsite)) issues.push("offsite-configuration");
  if (offsite === "disabled" && ["RESTIC_REPOSITORY", "RESTIC_REPOSITORY_FILE", "RESTIC_PASSWORD_FILE", "RESTIC_PASSWORD", "RESTIC_PASSWORD_COMMAND"].some((key) => env[key])) {
    issues.push("offsite-configuration");
  }
  let base;
  try {
    base = endpoint(env.TKA_MONITOR_URL, env.TKA_MONITOR_ALLOW_HTTP === "true");
    if (base.pathname !== "/" || base.search) throw new Error("Origin required");
  } catch {
    issues.push("monitor-url-configuration");
  }
  if (base) {
    for (const [path, status] of [["live", "live"], ["ready", "ready"]]) {
      try {
        const response = await fetcher(new URL(`/api/health/${path}`, base), {
          redirect: "error", signal: AbortSignal.timeout(timeout),
        });
        const body = await jsonResponse(response);
        if (body.status !== status || body.mode !== "production" ||
            (path === "ready" && (body.ready !== true || body.storage !== "postgresql"))) {
          throw new Error("Not production ready");
        }
      } catch {
        issues.push(`health-${path}`);
      }
    }
  }
  const directory = env.TKA_BACKUP_DIR ?? "/opt/tka-rehab/backups";
  const markers = offsite === "restic" ? ["backup", "offsite"] : ["backup"];
  for (const marker of markers) {
    try {
      const file = join(directory, `.${marker}-success`);
      if ((await stat(file)).size > 32) throw new Error("Invalid marker");
      const value = (await readFile(file, "utf8")).trim();
      if (!/^\d+$/.test(value)) throw new Error("Invalid timestamp");
      const age = now - Number(value) * 1000;
      if (!Number.isFinite(age) || age < -60000 || age > maxAge) throw new Error("Stale backup");
    } catch {
      issues.push(`${marker}-freshness`);
    }
  }
  if (issues.length && env.TKA_MONITOR_WEBHOOK_FILE) {
    try {
      const fileStat = await stat(env.TKA_MONITOR_WEBHOOK_FILE);
      if ((fileStat.mode & 0o077) !== 0 || fileStat.size > 8192) throw new Error("Unsafe webhook file");
      const url = endpoint((await readFile(env.TKA_MONITOR_WEBHOOK_FILE, "utf8")).trim());
      const response = await fetcher(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `TKA operations check failed: ${issues.join(", ")}` }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error("Webhook failed");
    } catch {
      issues.push("webhook-delivery");
    }
  }
  return { ok: issues.length === 0, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runMonitor();
    console.log(result.ok ? "TKA operations check passed." : `TKA operations check failed: ${result.issues.join(", ")}`);
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error("TKA operations check failed: unexpected monitor error.");
    process.exitCode = 1;
  }
}
