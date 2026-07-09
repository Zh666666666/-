---
name: tka-realtime-supabase
description: Use for Supabase configuration, Realtime subscriptions, RLS/realtime SQL, Prisma Postgres integration, DATABASE_URL/DIRECT_URL setup, and production database behavior.
---

# TKA Realtime Supabase

## When To Use

Use this skill when work touches Supabase Auth, Realtime synchronization,
Postgres persistence, Prisma adapters, database migrations, or deployment
environment variables.

## Workflow

1. Read `.env.example` and compare with the target environment.
2. Read `src/lib/env.ts` and `src/lib/supabase-config.ts`.
3. Read `src/lib/realtime.ts` before changing subscription behavior.
4. Check Prisma schema and migrations for table changes.
5. Update `supabase/realtime.sql` when a new realtime table or policy is needed.
6. Keep demo polling fallback intact for unconfigured environments.

## Commands

- `cmd /c npm run db:generate`
- `cmd /c npm run db:migrate`
- `cmd /c npm run db:deploy`
- `cmd /c npm run build`

## Files To Inspect

- `.env.example`
- `src/lib/env.ts`
- `src/lib/supabase-config.ts`
- `src/lib/supabase.ts`
- `src/lib/supabase-server.ts`
- `src/lib/realtime.ts`
- `src/lib/prisma.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**/migration.sql`
- `supabase/realtime.sql`

## Common Mistakes

- Treating Supabase Auth configuration and database configuration as the same.
- Adding Prisma models without realtime publication updates when UI sync needs it.
- Running development migrations against production.
- Removing demo fallback while debugging database mode.

## Verification Checklist

- Prisma client generation succeeds.
- Migrations reflect schema changes.
- Realtime SQL mentions every table that should sync.
- Demo mode still works without database credentials.
- Production mode has required env vars documented.
