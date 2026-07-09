---
name: tka-testing-qa
description: Use for validation strategy, build/lint checks, manual QA flows, API smoke tests, browser verification, and regression risk assessment for the TKA rehab platform.
---

# TKA Testing QA

## When To Use

Use this skill before finishing any change, when adding tests/checks, or when a
user asks whether the project is usable.

## Workflow

1. Identify the blast radius: frontend, API, data model, auth, or artifacts.
2. Run the smallest meaningful check first.
3. For app code, run `cmd /c npm run build` on Windows or `npm run build` on
   Linux/Codespaces.
4. Run lint when touching linted source; report known PPT-script lint failures
   separately if they are unrelated.
5. Use local browser checks for role flows and visual behavior.
6. Use API smoke checks for route handler changes.

## Commands

- `cmd /c npm run build`
- `cmd /c npm run lint`
- `cmd /c npm run dev`
- Linux/Codespaces equivalents omit the `cmd /c` prefix.
- API smoke examples:
  - `GET /api/dashboard`
  - `POST /api/knee-records`
  - `POST /api/ai-analyses`
  - `PATCH /api/alerts/<id>`
  - `POST /api/appointments`
  - `PATCH /api/appointments/<id>`

## Files To Inspect

- `package.json`
- `eslint.config.mjs`
- `next.config.ts`
- `src/app/api/**/route.ts`
- `src/app/login/login-form.tsx`
- `src/app/family/**`
- `src/app/nurse/**`

## Common Mistakes

- Reporting lint as fully broken without noting the failing file scope.
- Skipping demo mode after API changes.
- Relying on build only for visual or role-routing changes.
- Forgetting PowerShell may block `npm.ps1`; use `cmd /c npm ...`.

## Verification Checklist

- Build passes or the failure is clearly explained.
- Relevant browser paths were checked.
- Relevant API routes were smoke-tested.
- Known unrelated warnings are separated from new regressions.
