# Claude Code — project guide

This file orients Claude for coding sessions in this repo.

## Project at a glance

- **Name:** Office Hours: Back of House (OHG-BoH)
- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4
  + shadcn/ui + Supabase (Postgres + Auth + Storage) + sonner
- **Data layer:** `supabase-js` with RLS doing authorization. No Prisma.
  Schema lives in `supabase/migrations/`. TS types hand-written in
  `lib/supabase/types.ts` (regenerate with `pnpm db:types` against a
  live project).
- **Deploy:** Vercel (auto from `main`); migrations via the
  `.github/workflows/db-migrate.yml` Action (auto on push to main that
  touches `supabase/migrations/**`, or manual dispatch).
- **Auth:** email + password OR 6-digit OTP code. Roles stored on
  `public.users.role` (`contributor` | `admin`). Contributors are
  linked to a `contributors` row via `public.users.linked_contributor_id`.

See the README for the full architecture + deployment runbook.

## Startup routine — check for user feedback

At the start of each session, query unresolved feedback rows, summarize
them for me, and propose which to address next.

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/feedback?select=*&resolved_at=is.null&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
```

Both env vars live in `.env.local`. Note that `.env.local` is **not**
auto-exported to Claude Code's shell — source it once per session:

```bash
set -a; source .env.local; set +a
```

Or make it permanent with direnv (`.envrc` in the repo root containing
`dotenv .env.local`) plus `direnv allow`.

After resolving feedback items, do a fresh-eyes review of the changed
code: re-read every modified file end-to-end, look for bugs,
regressions, missed edge cases, and consistency issues. Fix anything
found, then commit and push.

When a fix ships, mark the corresponding feedback row resolved so it
drops off the next query:

```sql
update public.feedback set resolved_at = now() where id = '<uuid>';
```

Or via the admin API (when signed in as admin):

```bash
curl -X PATCH https://office-hours-back-of-house.vercel.app/api/admin/feedback \
  -H "Content-Type: application/json" \
  -d '{"id": "<uuid>", "resolved": true}' \
  --cookie "<session cookie>"
```

## Conventions

### Git & deploy
- Develop on `claude/boh-*` branches. Merge to `main` when ready to
  ship. Main is the deploy branch (Vercel builds prod from it; DB
  migrations apply from it).
- Never force-push. Never push to `main` without explicit permission.
- Never skip hooks or signing.

### Data layer
- Every page that reads user-scoped data should be a Server Component
  using `createSupabaseServerClient` from `@/lib/supabase/server`.
- Client Components that need auth-scoped Supabase access use
  `createSupabaseBrowserClient` from `@/lib/supabase/client`.
- Service-role access (bypassing RLS) goes through
  `createSupabaseAdminClient` from `@/lib/supabase/admin` — only in
  server code, only after an app-level auth check.
- Authorization lives in RLS wherever possible, not in app code.
  `public.is_admin(uid)` is the canonical admin check in SQL. In TS,
  use `getCurrentAppUser()` from `@/lib/supabase/auth` and check
  `appUser.role`.

### UI
- shadcn/ui primitives live in `components/ui/`. Tailwind v4 + CSS
  variables for theming. No `tailwindcss-animate`; Dialogs use no
  entrance animation.
- Toasts via `sonner` (mounted once in `app/layout.tsx`).
- Floating feedback button (bottom-right) is mounted in the layout
  and only renders when a user is signed in.

### Migrations
- New migration: `supabase migration new <name>` or just add a
  sequential `supabase/migrations/000N_name.sql` file. Keep the
  numbering monotonic.
- Test locally with `pnpm db:reset` before merging.
- Merging to `main` applies migrations to production automatically
  (via the CI workflow).
- Triggers that write to RLS-restricted tables must be
  `SECURITY DEFINER`. See `0003_fix_trigger_security_definer.sql`
  for the pattern.

### Before shipping
1. `pnpm typecheck` — must pass.
2. `pnpm build` — must pass.
3. If UI changes: start the dev server, actually click through the
   change in a browser. Don't mark a UI task done just because code
   compiles.
4. Write a commit message that explains **why**, not just what.

## Not my problem

- Styling minutiae (pixel-perfect anything) unless called out.
- Legacy magic-link code paths — they're gone. OTP + password only.
- Prisma — we don't use it. Don't reintroduce.
