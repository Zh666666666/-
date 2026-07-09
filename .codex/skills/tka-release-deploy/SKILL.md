---
name: tka-release-deploy
description: Use for production build, Vercel deployment, server/PM2/Nginx deployment, environment preparation, Prisma migration deployment, and release readiness checks.
---

# TKA Release Deploy

## When To Use

Use this skill for deployment prep, production readiness, environment variables,
domain setup, database migration deployment, or release notes.

## Workflow

1. Verify build with `cmd /c npm run build` on Windows or `npm run build` on
   Linux/Codespaces.
2. Confirm required environment variables:
   `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_APP_URL`, and optional AI keys.
3. Generate Prisma client and deploy migrations before production runtime.
4. Apply Supabase Realtime/RLS SQL if realtime sync is required.
5. Confirm `/login`, `/family`, `/nurse`, and `/appointments` after deployment.
6. Document any known lint/artifact-script caveats.

## Commands

- `cmd /c npm run db:generate`
- `cmd /c npm run db:deploy`
- `cmd /c npm run build`
- `cmd /c npm run start`
- Linux/Codespaces equivalents omit the `cmd /c` prefix.
- Codespaces development: `npm run dev -- --hostname 0.0.0.0`

## Files To Inspect

- `README.md`
- `.env.example`
- `package.json`
- `next.config.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**/migration.sql`
- `supabase/realtime.sql`
- `src/lib/env.ts`

## Common Mistakes

- Running `db:migrate` instead of `db:deploy` for production.
- Deploying with Supabase Auth keys but no usable database URL.
- Forgetting `DIRECT_URL` for migration operations.
- Assuming local in-memory demo state persists across server restarts.
- Committing `.env`, research data, or copyright materials to the public
  repository.

## Verification Checklist

- Production build passes.
- Migrations have been applied.
- Env vars are complete and not placeholders.
- Role login and protected routes work on deployed domain.
- Dashboard data path is confirmed as demo or database intentionally.
