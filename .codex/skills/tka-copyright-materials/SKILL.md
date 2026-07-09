---
name: tka-copyright-materials
description: Use for software copyright submission materials, application info, ownership transfer template, software manual, source-code excerpts, and submission steps under copyright-materials.
---

# TKA Copyright Materials

## When To Use

Use this skill when editing or checking software copyright materials, manuals,
application forms, ownership documents, or source-code excerpts.

## Workflow

1. Read the target file under `copyright-materials`.
2. Cross-check factual claims against the app structure and README.
3. Keep legal/ownership language conservative; do not invent facts.
4. If source excerpts need updating, select representative app code from stable
   areas such as domain logic, API routes, and UI pages.
5. Do not modify app runtime code for a documentation-only request.

## Commands

- Usually no app command is required for documentation-only edits.
- Use `cmd /c npm run build` only if the doc change depends on app behavior.

## Files To Inspect

- `copyright-materials/application-info.md`
- `copyright-materials/ownership-transfer-template.md`
- `copyright-materials/software-manual.md`
- `copyright-materials/source-code-excerpt.txt`
- `copyright-materials/submission-steps.md`
- `README.md`
- `src/lib/rehab.ts`
- `src/app/api/**/route.ts`

## Common Mistakes

- Overstating deployed capabilities not present in the code.
- Mixing research artifacts with software copyright source excerpts.
- Updating product names in one document but not related materials.
- Including secrets or `.env` values in excerpts.

## Verification Checklist

- Product name, features, and route descriptions are consistent.
- No secrets or private credentials are included.
- Claims match current code.
- Formatting remains submission-friendly.
