---
name: tka-architecture
description: Use for understanding or modifying the TKA rehab platform architecture, route layout, domain model, product loop, or cross-cutting app structure in this Next.js 15 Prisma Supabase project.
---

# TKA Architecture

## When To Use

Use this skill before changes that affect multiple layers, page/API routing,
domain types, patient records, nursing workflow, or the family/nurse product loop.

## Workflow

1. Start at `AGENTS.md` for the current repository map.
2. Read `src/lib/rehab.ts` for domain types, seed patients, assessment rules,
   SOAP helpers, and serializers.
3. Read `src/lib/data.ts` to understand how dashboard data is assembled.
4. Check the relevant route in `src/app` and matching API in `src/app/api`.
5. If persistence is involved, inspect `prisma/schema.prisma` and migrations.
6. Keep the loop intact: data ingestion -> assessment -> alert -> nurse action
   -> nursing record/guidance -> family follow-up -> appointment if needed.
7. For sensor work, keep the Android BLE transport separate from the
   transport-independent gateway core and server APIs.

## Commands

- `cmd /c npm run build`
- `cmd /c npm run lint`
- `cmd /c npm run gateway:test`

## Files To Inspect

- `AGENTS.md`
- `src/lib/rehab.ts`
- `src/lib/data.ts`
- `src/lib/demo-store.ts`
- `src/app/family/page.tsx`
- `src/app/nurse/page.tsx`
- `src/app/api/**/route.ts`
- `prisma/schema.prisma`
- `hardware-gateway/**`
- `docs/HARDWARE_GATEWAY.md`

## Common Mistakes

- Changing Prisma models without updating serializers and demo data.
- Treating demo mode as a mock-only path; it is a supported presentation path.
- Moving workflow logic into pages when it belongs in `src/lib/rehab.ts`.
- Breaking the family/nurse role split by sharing state without role checks.
- Treating WT9011DCL-BT50 as a Windows serial-port sensor instead of using its
  BLE 5.0 Android SDK path.
- Marking generated or replayed samples as real hardware data.

## Verification Checklist

- The affected family and nurse pages still render.
- Dashboard JSON still includes patients, records, alerts, nursing records, and
  AI analyses.
- Build passes.
- Any schema-affecting change has a migration and updated demo fallback.
- Gateway protocol, BLE record, and offline queue tests pass.
