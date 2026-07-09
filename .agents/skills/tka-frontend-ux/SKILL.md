---
name: tka-frontend-ux
description: Use for family portal, nurse workbench, appointments UI, profile/device pages, medical dashboard UX, charts, responsive layout, copy, and shared UI components.
---

# TKA Frontend UX

## When To Use

Use this skill for user-facing React pages, dashboard layouts, visual states,
navigation, chart rendering, or patient/nurse workflow interactions.

## Workflow

1. Read the target page and shared components before editing.
2. Keep the UI operational and dense; this is a medical workbench, not a landing
   page.
3. Use existing components in `src/components/ui` and lucide icons.
4. Preserve route navigation and bottom/floating navigation behavior.
5. For charts, provide stable container dimensions to avoid Recharts width/height
   warnings.
6. Keep family language reassuring and nurse language action-oriented.

## Commands

- `cmd /c npm run build`
- `cmd /c npm run lint`
- Browser-check affected routes at desktop and mobile widths.

## Files To Inspect

- `src/app/family/page.tsx`
- `src/app/family/guidance/page.tsx`
- `src/app/family/devices/page.tsx`
- `src/app/family/profile/page.tsx`
- `src/app/family/tcm-knowledge/page.tsx`
- `src/app/nurse/page.tsx`
- `src/app/appointments/page.tsx`
- `src/components/role-navigation.tsx`
- `src/components/status-notice.tsx`
- `src/components/metric-education-dialog.tsx`
- `src/app/globals.css`

## Common Mistakes

- Adding marketing-style hero sections where a work surface is needed.
- Introducing large nested cards or decorative-only gradients.
- Letting long Chinese text overflow mobile controls.
- Rendering charts in containers that can be zero-sized on first paint.
- Breaking demo sync indicators or role navigation.

## Verification Checklist

- No incoherent text overlap on mobile or desktop.
- Buttons and links remain reachable.
- Charts render after refresh.
- Family and nurse paths still match their intended role tone.
- Build passes.
