# Supabase Security Boundary

## Decision and scope

The entire `public` schema is backend-only. Neither `anon` nor `authenticated`
may directly read or write application data, even their own patient's rows.
This includes REST, GraphQL, public RPCs, and Supabase Postgres Changes.
Supabase Auth remains available; its `auth` schema is not modified.

Repository inspection on 2026-09-06 found:

- `supabase/realtime.sql` was the only RLS/publication configuration. Its old
  policies omitted `TO`, so the allow-all expressions applied to PUBLIC, not
  merely anonymous users. Editing that file alone would not fix an existing DB.
- Prisma migrations create application tables but do not configure RLS/grants.
  Newer account, verification, invitation, audit, and gateway tables were omitted
  from the old script entirely.
- `src/lib/supabase*.ts` and middleware use Supabase Auth. No application
  Supabase `.from()` database queries or `.rpc()` calls were found.
- `src/lib/prisma.ts` uses server-only `DATABASE_URL`. `server-access.ts`
  resolves family patient linkage and nurse assignments for server APIs.
  That server authorization remains essential: a privileged backend bypasses RLS.
- `src/lib/realtime.ts` subscribes without patient filters, but callbacks only
  trigger API refreshes. Family, nurse, appointments, and guidance pages retain
  interval polling when Supabase is configured. Push notifications stop under
  this baseline; refresh latency becomes the existing polling interval. A
  subscription status indicator can still say connected without receiving rows.
- Gateway credential APIs select explicit response fields, omitting `tokenHash`.
  SQL must independently block `gateway_credentials.token_hash`; API serialization
  alone does not prevent direct database reads. The entire table is denied and
  removed from Realtime, as are device tokens and other credential-bearing tables.

## Apply the cleanup

This is an operator procedure, **not performed by this change**. Use a dedicated
TKA database: the cleanup deliberately revokes client access to ALL objects in
`public`, including custom views/routines, and removes ALL public-table policies.
Review custom integrations first. It does not delete rows, tables, or columns.

1. Back up the database and capture existing grants, policies, publications,
   custom routines/views, role memberships, and configured API-exposed schemas.
   Disable the Supabase Data API during remediation if the old script was used.
   Review other exposed schemas and security-definer functions outside `public`;
   this repository defines none, and this script cannot secure unknown wrappers.
2. Confirm the trusted Prisma database login owns the application tables (the
   documented connection uses `postgres`), or has explicit schema/object grants
   plus BYPASSRLS. Do not use `anon` or `authenticated` as the server DB login.
   A custom backend role relying on PUBLIC grants must receive narrowly reviewed
   explicit grants before cleanup. Check any required public extension routines
   too. Do not grant clients BYPASSRLS or membership in privileged backend roles.
3. Apply all Prisma migrations, including the gateway credential migration.
   Then execute **either** `supabase/realtime.sql` **or** the identical forward
   migration `supabase/migrations/20260906010000_backend_only_security.sql` as
   the database owner. The latter is not run by Prisma's migration command.
   Both files are standalone SQL, usable in SQL Editor, and safe to rerun after
   a successful application. Keep deployment/migration writers paused until done.

   ```powershell
   psql "$env:DIRECT_URL" -X -v ON_ERROR_STOP=1 -f supabase/realtime.sql
   psql "$env:DIRECT_URL" -X -v ON_ERROR_STOP=1 -f supabase/verify-security.sql
   ```

4. Require COMMIT and **zero audit rows**. Errors roll back the whole cleanup;
   they do not mean partial protection succeeded. On timeout, fix contention and
   rerun. On inherited grants, fix the role/grantor configuration and rerun.
   For a schema-wide Realtime publication, have its owner remove `public` via
   `ALTER PUBLICATION supabase_realtime DROP TABLES IN SCHEMA public` (PG15+).
   For `FOR ALL TABLES`, an operator must recreate it with an explicit reviewed
   table list excluding `public`; do not blindly drop a shared publication.
   Keep the Data API disabled until the cleanup and verification succeed.
5. Reconnect client sessions and verify the negative tests below. Prefer leaving
   the Data API disabled because this application does not use it. Review active
   Realtime connections/cached access during the maintenance window as well.

No `FORCE ROW LEVEL SECURITY` is introduced, preserving the Prisma table owner's
access. Explicit `service_role` grants are not revoked; that key remains a
privileged secret and must never enter browser variables, logs, or responses.
The script does not create or grant a new privileged backend role.

Schema USAGE/CREATE revocation is the future-object boundary regardless of the
creator's default privileges. Table/sequence defaults are additionally revoked
for the executing role only. Rerun the baseline after future migrations to apply
RLS and remove publication entries for new tables. Do not restore schema access,
add public RPC grants, or publish public tables without a new security review.
Future function EXECUTE defaults alone are not protection; schema denial must
stay in place. Never restore the legacy allow-all script as a rollback.

## Verification and limits

Local static regression command:

```text
node --test supabase/security.test.mjs
```

The checks compare bootstrap/migration contents, assert denial and cleanup
guardrails, and require the read-only audit inventory to cover every current
Prisma model and migration-created table. They do not execute PostgreSQL SQL.

Required staging/live acceptance, using non-sensitive test fixtures:

- Audit both anonymous and authenticated roles: no public schema/table/column,
  sequence, or routine privileges; all public tables have RLS and zero policies;
  no public tables in `supabase_realtime`. Require all expected tables to exist.
- With an anon key and separately valid JWTs for patient A, patient B, and a
  nurse, direct reads and INSERT/UPDATE/DELETE must be denied. Include own and
  other patients, all clinical tables, `profiles`, accounts, invitations, device
  tokens, and specifically a `gateway_credentials?select=token_hash` request.
  JWT patient filters must not turn a denied request into an allowed one.
- Verify GraphQL and public RPC paths cannot bypass this denial; inventory any
  non-public exposed schemas and custom security-definer wrappers separately.
- While subscribed as those users, perform INSERT/UPDATE/DELETE via the backend;
  no raw public-row events or deleted-row identifiers should be delivered.
- Confirm Supabase sign-in/sign-out and local-auth APIs still work. Verify server
  APIs allow legitimate patient/nurse/gateway operations, reject cross-patient
  operations, and never return stored token hashes. Check polling refreshes.
- Apply the baseline a second time and rerun the audit. Test future-table grants
  in a disposable database to confirm schema denial still prevents direct access.

**The actual Supabase database has not been connected to, changed, or verified.**
Static checks cannot establish deployed grants, role memberships, external
schemas, publication behavior, or backend availability. Historical exposure
cannot be undone: review access logs and rotate exposed credentials/tokens as
appropriate through the existing trusted administrative workflow.

The README's older demo-RLS/publication instructions are superseded by this
document; README and project-status edits are outside this subtask's ownership.

## References

- [Supabase: securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: securing data with backend access](https://supabase.com/docs/guides/database/secure-data)
- [Supabase: Postgres Changes and DELETE limitations](https://supabase.com/docs/guides/realtime/postgres-changes)
- [PostgreSQL: REVOKE and inherited privileges](https://www.postgresql.org/docs/current/sql-revoke.html)
