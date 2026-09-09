import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer } from "node:http";
import { runMonitor } from "../health-monitor.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "tka-monitor-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, ".backup-success"), `${Math.floor(Date.now() / 1000)}\n`);
  return { TKA_MONITOR_URL: "https://monitor.invalid", TKA_BACKUP_DIR: dir };
}
function healthy(url) {
  const ready = url.pathname.endsWith("ready");
  return Promise.resolve(Response.json({ status: ready ? "ready" : "live", mode: "production", ready: true, storage: "postgresql" }));
}

test("healthy production and fresh backup pass", async (t) => {
  assert.equal((await runMonitor(await fixture(t), healthy)).ok, true);
});
test("demo, wrong storage, false readiness, malformed JSON, 503 and network failure reject", async (t) => {
  const env = await fixture(t);
  for (const fetcher of [
    () => Promise.resolve(Response.json({ status: "ready", mode: "demo" })),
    () => Promise.resolve(Response.json({ status: "ready", mode: "production", ready: true, storage: "memory" })),
    () => Promise.resolve(Response.json({ status: "ready", mode: "production", ready: false, storage: "postgresql" })),
    () => Promise.resolve(new Response("not json")),
    () => Promise.resolve(new Response("unavailable", { status: 503 })),
    () => Promise.reject(new Error("SECRET-MUST-NOT-LEAK")),
    () => Promise.resolve(new Response("x".repeat(65537))),
  ]) {
    const result = await runMonitor(env, fetcher);
    assert.equal(result.ok, false);
    assert.ok(result.issues.includes("health-ready"));
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  }
});
test("missing, stale, corrupt and future backup evidence reject", async (t) => {
  const env = await fixture(t);
  for (const value of ["0", "garbage", String(Math.floor(Date.now() / 1000) + 3600)]) {
    await writeFile(join(env.TKA_BACKUP_DIR, ".backup-success"), value);
    assert.deepEqual((await runMonitor(env, healthy)).issues, ["backup-freshness"]);
  }
  await rm(join(env.TKA_BACKUP_DIR, ".backup-success"));
  assert.equal((await runMonitor(env, healthy)).ok, false);
});
test("offsite requires its own fresh success marker", async (t) => {
  const env = { ...await fixture(t), TKA_OFFSITE_BACKUP: "restic" };
  assert.deepEqual((await runMonitor(env, healthy)).issues, ["offsite-freshness"]);
  await writeFile(join(env.TKA_BACKUP_DIR, ".offsite-success"), String(Math.floor(Date.now() / 1000)));
  assert.equal((await runMonitor(env, healthy)).ok, true);
});
test("invalid configuration rejects without exposing URLs", async (t) => {
  const env = await fixture(t);
  for (const value of ["http://monitor.invalid", "https://user:SECRET@monitor.invalid", "https://monitor.invalid/path", "invalid"]) {
    const result = await runMonitor({ ...env, TKA_MONITOR_URL: value }, healthy);
    assert.ok(result.issues.includes("monitor-url-configuration"));
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  }
  assert.equal((await runMonitor({ ...env, TKA_MONITOR_TIMEOUT_MS: "NaN" }, healthy)).ok, false);
  assert.equal((await runMonitor({ ...env, TKA_OFFSITE_BACKUP: "typo" }, healthy)).ok, false);
  assert.equal((await runMonitor({ ...env, RESTIC_REPOSITORY: "s3:configured-but-disabled" }, healthy)).ok, false);
});
test("requests prohibit redirects and carry timeouts", async (t) => {
  const env = await fixture(t);
  await runMonitor(env, (url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return healthy(url);
  });
});
test("real local HTTP requests time out and reject redirects", async (t) => {
  const env = await fixture(t);
  let redirect = false;
  const server = createServer((_request, response) => {
    if (redirect) {
      response.writeHead(302, { location: "/somewhere-else" });
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  env.TKA_MONITOR_URL = `http://127.0.0.1:${server.address().port}`;
  env.TKA_MONITOR_ALLOW_HTTP = "true";
  env.TKA_MONITOR_TIMEOUT_MS = "100";
  assert.deepEqual((await runMonitor(env)).issues, ["health-live", "health-ready"]);
  redirect = true;
  assert.deepEqual((await runMonitor(env)).issues, ["health-live", "health-ready"]);
});
test("webhook contains only fixed issue codes and failure stays nonzero", { skip: process.platform === "win32" && "Unix permission validation requires Linux" }, async (t) => {
  const env = await fixture(t);
  env.TKA_MONITOR_WEBHOOK_FILE = join(env.TKA_BACKUP_DIR, "webhook");
  await writeFile(env.TKA_MONITOR_WEBHOOK_FILE, "https://webhook.invalid/SECRET", { mode: 0o600 });
  let posts = 0;
  const result = await runMonitor(env, async (url, options) => {
    if (options.method === "POST") {
      posts++;
      assert.equal(options.redirect, "error");
      assert.ok(!options.body.includes("SECRET"));
      return new Response(null, { status: 500 });
    }
    throw new Error("SECRET");
  });
  assert.equal(posts, 1);
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("webhook-delivery"));
  await chmod(env.TKA_MONITOR_WEBHOOK_FILE, 0o644);
  posts = 0;
  await runMonitor(env, async () => { throw new Error("no request"); });
  assert.equal(posts, 0);
});
test("CLI returns nonzero and never prints configuration secrets", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../health-monitor.mjs", import.meta.url))], {
    env: { ...process.env, TKA_MONITOR_URL: "https://user:SECRET@invalid", TKA_BACKUP_DIR: "missing-directory", TKA_MONITOR_WEBHOOK_FILE: "" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.ok(!`${result.stdout}${result.stderr}`.includes("SECRET"));
  assert.match(result.stdout, /check failed/);
});
