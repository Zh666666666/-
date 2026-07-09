---
name: tka-repo-training
description: Use for maintaining AGENTS.md and repository skills, applying Fable-5-style repository training, onboarding future Codex agents, and updating durable guidance after architecture changes.
---

# TKA Repo Training

## When To Use

Use this skill when creating or updating `AGENTS.md`, adding repository skills,
refreshing Codex guidance, or turning project knowledge into reusable workflows.

## Workflow

1. Investigate first; do not edit from memory.
2. Read README, package scripts, config, source layout, Prisma schema, API routes,
   demo store, and recent git history.
3. Identify durable facts: commands, architectural boundaries, risky areas,
   validation paths, and common workflows.
4. Generate or update focused skills. Each skill should include:
   - name
   - description
   - when to use
   - workflow
   - commands
   - files to inspect
   - common mistakes
   - verification checklist
5. Review for factual accuracy, usability, and safety.
6. Remove unsupported claims and keep instructions executable.

## Commands

- `git log --oneline -n 12`
- `git status --short --branch`
- `rg --files`
- `cmd /c npm run build`
- `cmd /c npm run lint`

## Files To Inspect

- `AGENTS.md`
- `.agents/skills/**/SKILL.md`
- `README.md`
- `package.json`
- `eslint.config.mjs`
- `next.config.ts`
- `src/lib/rehab.ts`
- `src/lib/demo-store.ts`
- `src/lib/data.ts`
- `prisma/schema.prisma`
- `supabase/realtime.sql`

## Common Mistakes

- Copying generic skill text that does not match this repository.
- Writing skills so broad that they always trigger.
- Putting unverified deployment or business claims into durable guidance.
- Forgetting to update skills after architecture or command changes.

## Verification Checklist

- Every skill frontmatter has only `name` and `description`.
- Skill names are lowercase hyphen-case.
- Instructions reference real files and commands.
- AGENTS.md and skills agree with each other.
- Claims are based on current repo inspection.
