---
name: tka-debugging
description: Use for diagnosing broken login, stuck demo/prod mode, API failures, dashboard data mismatches, Recharts warnings, build/lint failures, or local development issues.
---

# TKA Debugging

## When To Use

Use this skill when behavior is failing or surprising and the cause may span
environment variables, demo/database mode, API shape, role cookies, or rendering.

## Workflow

1. Reproduce the failure with the smallest route or API call.
2. Check whether the environment is demo or database mode via `DATABASE_URL`.
3. Check whether Supabase Auth is configured separately from database mode.
4. Inspect browser logs for UI issues.
5. Inspect route handlers for branch divergence between demo and Prisma paths.
6. Fix the smallest responsible layer and verify both the direct failure and the
   surrounding workflow.

## Commands

- `cmd /c npm run build`
- `cmd /c npm run lint`
- `cmd /c npm run dev`
- `git status --short --branch`
- `rg "<error text or route name>" src`

## Files To Inspect

- `.env`
- `.env.example`
- `src/lib/env.ts`
- `src/lib/supabase-config.ts`
- `middleware.ts`
- `src/app/login/login-form.tsx`
- `src/lib/demo-store.ts`
- `src/lib/data.ts`
- Relevant `src/app/api/**/route.ts`

## Common Mistakes

- Debugging Supabase when the failing path is actually demo store logic.
- Ignoring stale browser cookies after role changes.
- Missing Windows command quoting/encoding issues in manual API tests.
- Treating Recharts first-paint warnings as data failures before checking layout.

## Verification Checklist

- The root cause is tied to a specific file or environment state.
- The fix does not mask demo/database branch divergence.
- The original reproduction now passes.
- Build or a targeted smoke check confirms the fix.
