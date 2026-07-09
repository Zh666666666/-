---
name: tka-demo-data
description: Use for demo-mode data, in-memory dashboard state, seed patients, fallback behavior without DATABASE_URL, simulated smart brace records, alerts, appointments, profiles, and nursing records.
---

# TKA Demo Data

## When To Use

Use this skill when changing fallback behavior, demo state, seeded records,
presentation flows, or anything that must work without a configured database.

## Workflow

1. Read `src/lib/env.ts` to confirm how demo mode is selected.
2. Read `src/lib/demo-store.ts` for in-memory state and mutation helpers.
3. Read `src/lib/rehab.ts` for seed patients and assessment rules.
4. Read the API route that calls the demo helper.
5. Ensure demo mutations mirror the Prisma-backed behavior closely enough for
   family/nurse demos.

## Commands

- `cmd /c npm run build`
- API smoke:
  - `GET /api/dashboard`
  - `POST /api/knee-records`
  - `POST /api/nursing-records`
  - `POST /api/appointments`

## Files To Inspect

- `src/lib/env.ts`
- `src/lib/demo-store.ts`
- `src/lib/rehab.ts`
- `src/lib/data.ts`
- `src/app/api/knee-records/route.ts`
- `src/app/api/nursing-records/route.ts`
- `src/app/api/appointments/route.ts`
- `src/app/api/alerts/[id]/route.ts`

## Common Mistakes

- Adding a database field but omitting it from demo state.
- Returning Date objects from demo APIs instead of ISO strings.
- Letting demo state diverge from Prisma route behavior.
- Forgetting that demo state is process-local and resets when the dev server
  restarts.

## Verification Checklist

- `/api/dashboard` works when `DATABASE_URL` is missing or placeholder.
- New knee records can create alerts.
- Alerts can be resolved.
- Nursing records serialize SOAP data correctly.
- Appointments can be created and updated in demo mode.
