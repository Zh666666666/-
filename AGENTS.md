# TKA Rehab Platform Agent Guide

This repository is a Next.js 15 App Router application for TKA post-operative
knee rehabilitation monitoring. It has two user surfaces: a family portal and a
nurse workbench. The core loop is sensor/rehab data ingestion, risk assessment,
nurse intervention, SOAP nursing records, family guidance, and appointments.

## Repository Map

- `src/app` contains App Router pages and route handlers.
- `src/app/api` contains JSON APIs for dashboard data, knee records, alerts,
  appointments, profiles, auth role switching, AI analyses, and nursing records.
- `src/lib/rehab.ts` contains shared domain types, seed data, assessment rules,
  and serialization helpers.
- `src/lib/demo-store.ts` is the in-memory fallback store used when no usable
  `DATABASE_URL` is configured.
- `src/lib/data.ts` chooses between Prisma-backed data and demo data.
- `src/lib/auth.ts`, `middleware.ts`, and `src/app/login` own role routing.
- `src/lib/supabase*.ts` and `supabase/realtime.sql` own Supabase Auth and
  Realtime integration.
- `prisma/schema.prisma` and `prisma/migrations` define the production database.
- `research` contains SPSS-style data/charts for presentation or paper support.
- `copyright-materials` contains software copyright submission materials.
- `ppt-build*.js` and `ppt-font-test*.js` are presentation helper scripts, not
  application runtime code.
- These support artifacts are local-only because the GitHub repository is
  public. They are intentionally excluded by `.gitignore`.

## Product Loop

1. A user selects `family` or `nurse` at `/login`.
2. Family users enter `/family`; nurse users enter `/nurse`.
3. Knee records are created through `/api/knee-records` or simulated by the
   family portal in demo mode.
4. `assessKneeRecord` creates alerts for low ROM, low activity, short duration,
   high pain, or device problems.
5. Nurses review patients, trends, alerts, AI/local-rule analyses, and SOAP
   records in `/nurse`.
6. Nurses resolve alerts, create nursing guidance, and handle appointments.
7. Families read guidance, maintain profiles/devices, and request appointments.

## Commands

On Windows PowerShell, prefer `cmd /c npm ...` because `npm.ps1` may be blocked
by execution policy.

- Install/generate: `cmd /c npm install`
- Develop: `cmd /c npm run dev`
- Build: `cmd /c npm run build`
- Lint: `cmd /c npm run lint`
- Prisma generate: `cmd /c npm run db:generate`
- Development migration: `cmd /c npm run db:migrate`
- Production migration deploy: `cmd /c npm run db:deploy`

On Linux, GitHub Codespaces, and Codex cloud environments, use:

- Install/generate: `npm ci`
- Develop: `npm run dev -- --hostname 0.0.0.0`
- Build: `npm run build`
- Lint: `npm run lint`
- Prisma generate: `npm run db:generate`
- Production migration deploy: `npm run db:deploy`

Known current state: `npm run build` and `npm run lint` pass. Local PowerPoint
helper scripts are excluded from ESLint because they are not application code
and are not committed to the public repository.

## Environment Modes

- Demo mode is selected by `hasUsableDatabaseUrl()` in `src/lib/env.ts`.
- If `DATABASE_URL` is missing or still contains placeholders, APIs use
  `demo-store.ts`.
- Supabase Auth is considered configured when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist.
- Be careful with mixed configuration: Supabase public keys without a usable
  database can make auth behave like production while data APIs still use demo
  storage.
- AI analysis uses `OPENAI_API_KEY`, then `ANTHROPIC_API_KEY`, then local rules.

## Change Rules

- Keep edits scoped. Avoid unrelated visual, schema, or copy rewrites.
- Preserve the family/nurse role split and route protection behavior.
- Preserve demo-mode usability unless the task explicitly removes it.
- Keep API payload validation with `zod`.
- Update serializers whenever Prisma model output crosses a JSON boundary.
- Do not hand-edit generated folders such as `.next`, `node_modules`, or
  `tsconfig.tsbuildinfo`.
- Treat `research`, `copyright-materials`, and PPT scripts as support artifacts.
  Do not mix their concerns into the app unless asked.
- Do not add local support artifacts or `.env` files to the public GitHub
  repository.
- Use lucide icons and existing UI primitives from `src/components/ui`.
- Keep the operational UI dense, medical, and task-focused.
- Keep `.devcontainer`, GitHub Actions, and Linux commands working when changing
  dependencies or development scripts.

## Skills

Use the repository skills in `.agents/skills` when the task matches them.
They are mirrored under `.codex/skills` for setups that use that path; keep the
two directories synchronized when updating skills.

- `tka-architecture`
- `tka-auth-roles`
- `tka-demo-data`
- `tka-api-backend`
- `tka-frontend-ux`
- `tka-realtime-supabase`
- `tka-testing-qa`
- `tka-debugging`
- `tka-release-deploy`
- `tka-research-artifacts`
- `tka-copyright-materials`
- `tka-repo-training`

## Validation Checklist

- For app changes, run `cmd /c npm run build`.
- Run `cmd /c npm run lint` when the change touches linted app files; if it
  fails only on PPT helper scripts, report that scope clearly.
- For auth/role changes, verify `/login`, `/family`, `/nurse`, and role switching.
- For API changes, verify demo mode and database mode implications separately.
- For UI changes, verify family and nurse paths at desktop and mobile sizes.
- For data model changes, update Prisma schema, migrations, serializers, demo
  store, Supabase realtime SQL, and any dashboard consumers.
