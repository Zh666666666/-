---
name: tka-api-backend
description: Use for JSON API route handlers, zod validation, Prisma persistence, dashboard aggregation, alerts, knee records, nursing records, appointments, profiles, and AI analysis endpoints.
---

# TKA API Backend

## When To Use

Use this skill for any `src/app/api/**/route.ts` change or when adding backend
behavior consumed by family or nurse pages.

## Workflow

1. Identify the API route and its client consumers with `rg "/api/<name>" src`.
2. Read the `zod` schema and keep validation explicit.
3. Check the demo branch and the Prisma branch.
4. Use serializers for Date and enum output.
5. Keep route responses stable unless the UI and demo paths are updated together.
6. For AI analysis, preserve the fallback order: OpenAI -> Anthropic -> local rule.

## Commands

- `cmd /c npm run build`
- `cmd /c npm run lint`
- Use browser or HTTP smoke checks against local dev server when behavior changes.

## Files To Inspect

- `src/app/api/dashboard/route.ts`
- `src/app/api/knee-records/route.ts`
- `src/app/api/alerts/[id]/route.ts`
- `src/app/api/nursing-records/route.ts`
- `src/app/api/appointments/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/ai-analyses/route.ts`
- `src/lib/data.ts`
- `src/lib/demo-store.ts`
- `src/lib/rehab.ts`
- `prisma/schema.prisma`

## Common Mistakes

- Updating only the Prisma branch and breaking demo mode.
- Returning raw Prisma records with Date values that the UI does not expect.
- Calling external AI services without preserving local-rule fallback.
- Forgetting to update dashboard aggregation after new model fields.

## Verification Checklist

- Invalid payloads return 400 with useful issues.
- Demo and database paths return equivalent JSON shapes.
- Consumer pages render after the API change.
- Build passes.
