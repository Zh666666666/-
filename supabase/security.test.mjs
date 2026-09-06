import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replaceAll("\r\n", "\n").trim();
const baseline = read("./realtime.sql");
const audit = read("./verify-security.sql");
const executable = baseline.replace(/--[^\n]*/g, "");

test("bootstrap and forward cleanup migration cannot drift", () => {
  assert.equal(baseline, read("./migrations/20260906010000_backend_only_security.sql"));
});

test("backend-only grants, RLS cleanup and transaction guardrails remain present", () => {
  assert.match(executable, /^\s*BEGIN;/);
  assert.match(executable, /COMMIT;\s*$/);
  for (const target of ["SCHEMA public", "ALL TABLES IN SCHEMA public", "ALL SEQUENCES IN SCHEMA public", "ALL ROUTINES IN SCHEMA public"]) {
    assert.ok(executable.includes(`REVOKE ALL PRIVILEGES ON ${target} FROM PUBLIC, anon, authenticated;`));
  }
  assert.match(executable, /n\.nspname = 'public' AND c\.relkind IN \('r', 'p'\)/);
  assert.match(executable, /ENABLE ROW LEVEL SECURITY/);
  assert.match(executable, /FROM pg_policy WHERE polrelid = relation\.oid/);
  assert.match(executable, /DROP POLICY %I ON public\.%I/);
  assert.match(executable, /has_schema_privilege/);
  assert.match(executable, /has_any_column_privilege/);
  assert.match(executable, /RAISE EXCEPTION/);
  assert.doesNotMatch(executable, /CREATE POLICY|\bGRANT\b|FORCE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY/i);
});

test("Realtime cannot re-publish clinical rows or credential hashes", () => {
  assert.match(executable, /ALTER PUBLICATION supabase_realtime DROP TABLE public\.%I/);
  assert.match(executable, /pg_publication_tables/);
  assert.match(executable, /puballtables/);
  assert.doesNotMatch(executable, /ADD TABLE|SET TABLE/i);
});

test("read-only audit covers every Prisma model and migrated table", () => {
  const modelTables = [...read("../prisma/schema.prisma").matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]);
  const migrations = readdirSync(new URL("../prisma/migrations/", import.meta.url), { withFileTypes: true });
  const migrationTables = migrations.filter((entry) => entry.isDirectory()).flatMap((entry) =>
    [...read(`../prisma/migrations/${entry.name}/migration.sql`).matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]));
  for (const table of new Set([...modelTables, ...migrationTables])) {
    assert.ok(audit.includes(`('${table}')`), `Missing audit coverage: ${table}`);
  }
  assert.ok(modelTables.includes("gateway_credentials"));
  assert.doesNotMatch(audit.replace(/--[^\n]*/g, ""), /\b(ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\s+(TABLE|INTO|FROM|ON)\b/i);
});
