---
name: tka-auth-roles
description: Use for login, signed local sessions, role cookies, family/nurse routing, Supabase Auth, middleware protection, or logout behavior.
---

# TKA Auth Roles

## When To Use

Use this skill for `/login`, middleware redirects, `tka-role` cookie handling,
family/nurse role switching, local signed sessions, or Supabase Auth changes.

## Workflow

1. Read `src/lib/auth.ts` for `UserRole`, cookie name, and default role paths.
2. Read `middleware.ts` for route protection and mismatched-role redirects.
3. Read `src/app/login/login-form.tsx` for client login behavior.
4. Read `src/app/api/auth/role/route.ts`, `switch/route.ts`, and `logout/route.ts`.
5. Check `src/lib/supabase-config.ts`, `src/lib/supabase.ts`, and
   `src/lib/supabase-server.ts` before changing configured-auth detection.
6. Preserve demo login behavior unless explicitly asked to remove it.
7. In local production auth, keep role credentials separate, require the signed
   HTTP-only session, and do not permit client-side role switching.

## Commands

- `cmd /c npm run build`
- Browser check: `/login` -> choose family -> `/family`; choose nurse -> `/nurse`.

## Files To Inspect

- `src/lib/auth.ts`
- `src/lib/local-auth.ts`
- `src/app/api/auth/login/route.ts`
- `middleware.ts`
- `src/app/login/login-form.tsx`
- `src/app/api/auth/role/route.ts`
- `src/app/api/auth/switch/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/components/role-navigation.tsx`
- `src/components/role-switch-button.tsx`

## Common Mistakes

- Assuming Supabase public keys imply a usable database.
- Treating the readable role cookie as authentication without verifying the
  signed local session.
- Forgetting that role can come from Supabase metadata or the `tka-role` cookie.
- Redirecting `/family` users to nurse paths or vice versa after refresh.
- Leaving loading states stuck when Supabase sign-in fails.

## Verification Checklist

- Unauthenticated protected paths redirect to `/login?next=...`.
- Family login lands on `/family`.
- Nurse login lands on `/nurse`.
- Mismatched role paths redirect to the correct portal.
- Logout clears role and returns to `/login`.
