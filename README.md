# Office Hours: Back of House

Gear catalog and contributor-kit showcase for **Office Hours Global**. One
canonical entry per piece of gear (one Shure SM7B, one Amazon affiliate
link), with contributors curating their own kits that reference catalog
items rather than duplicating them.

Contributors include both **on-air** panelists and the **back-of-house
crew** who run the show — multiviewers, intercom systems, routing, rack
gear that viewers rarely get to see.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui** (new-york style, neutral palette)
- **Supabase**: Postgres + Auth (OTP codes via email) + Storage
- **Vercel AI Gateway** (`ai` + `@ai-sdk/gateway`): auto-fills gear catalog fields from a short description. Default model `anthropic/claude-haiku-4-5`; trivially swappable.
- **supabase-js** for queries; **RLS** for authorization
- **Vercel** target

No Prisma — the schema lives as SQL migrations in `supabase/migrations/`,
types in `lib/supabase/types.ts` (replace with generated types once you
have a real project — see `pnpm db:types`).

## Project layout

```
app/
  layout.tsx                   Root layout + site header / footer
  page.tsx                     Landing
  contributors/page.tsx        Index with On Air / Crew filter tabs
  contributors/[slug]/page.tsx Contributor kit page
  gear/page.tsx                Browsable, category-filterable catalog
  gear/[id]/page.tsx           Gear detail + hero image + "Also used by"
  kit/page.tsx                 Contributor kit editor (auth-required)
  kit/actions.ts               Server actions: add / suggest / remove kit entries
  admin/page.tsx               Pending-gear queue (admin-only)
  admin/actions.ts             Server actions: approve gear, edit details
  profile/page.tsx             Contributor profile editor (auth-required)
  profile/actions.ts           Server action: update contributor profile
  login/page.tsx               Two-step sign-in: email form, then 6-digit code
  login/actions.ts             sendOtpCode + verifyOtpCode + signOut actions
  api/gear/search/route.ts     Typeahead endpoint for the kit editor
components/
  ui/                          shadcn primitives
  site-header.tsx              Async, role-aware nav (Sign in / email + Sign out)
  contributor-card.tsx         On-air / crew cards on the index
  gear-card.tsx
  role-badge.tsx               On Air / Back of House pills
  amazon-link.tsx              Builds affiliate URL from ASIN
  gear-typeahead.tsx           Debounced search + "Create new gear" CTA
  kit-editor.tsx               Client-side editor used by /kit
  admin-pending-row.tsx        One row of the admin queue
  image-uploader.tsx           Reusable Supabase Storage uploader
  profile-editor.tsx           Client-side editor used by /profile
lib/
  utils.ts                     cn() helper
  amazon.ts                    buildAmazonUrl(asin) -> tag-suffixed URL
  categories.ts                Canonical category list
  supabase/
    client.ts                  Browser client (Client Components)
    server.ts                  Server client (Server Components / actions)
    admin.ts                   Service-role client (server only, RLS bypass)
    auth.ts                    getCurrentAppUser / requireAdmin helpers
    types.ts                   Hand-written Database type
middleware.ts                  Refreshes Supabase auth session cookies
supabase/
  config.toml                  Local Supabase CLI config
  migrations/0001_init.sql     Core schema, triggers, RLS policies
  migrations/0002_storage.sql  gear-images + headshots buckets + storage RLS
  seed.sql                     Placeholder contributors + ~24 gear items
```

## Data model

| Table                 | Notes                                                                |
| --------------------- | -------------------------------------------------------------------- |
| `users`               | Mirrors `auth.users`; `role` (contributor \| admin), `linked_contributor_id` |
| `contributors`        | `slug`, `show_role`, `role_types[]` (`on_air`, `crew` — array, can be both) |
| `gear_items`          | Canonical catalog. `asin` is null until admin approves; `status` flips pending → active |
| `kit_entries`         | `(contributor_id, gear_item_id, notes, category_override, display_order)` |
| `admin_notifications` | Auto-fired by trigger when pending gear is suggested                 |

### Triggers

- `on_auth_user_created` mirrors new `auth.users` rows into `public.users`.
- `on_gear_inserted` writes an `admin_notifications` row whenever pending
  gear is suggested.
- `on_gear_status_change` resolves any open notifications when an admin
  flips the gear from `pending` to `active`.

### RLS in plain English

- Anyone (signed-in or not) can read `contributors`, `gear_items`,
  `kit_entries`.
- Authenticated users can insert new `gear_items` (always pending; no
  affiliate link).
- A user can edit `kit_entries` only for the contributor row their
  `users.linked_contributor_id` points at. Admins can edit any.
- Only admins can update `gear_items` (set ASIN, flip status), update
  `contributors`, or read `admin_notifications`.

## Affiliate links

- Stored as ASINs (10-character Amazon IDs), not full URLs.
- `lib/amazon.ts#buildAmazonUrl` returns
  `https://www.amazon.{TLD}/dp/{ASIN}?tag={NEXT_PUBLIC_AMAZON_AFFILIATE_TAG}`.
- The tag is a config value, so rotating it is one env-var change — no DB
  rewrite.
- `<AmazonLink asin={...} />` renders a disabled "Affiliate link pending"
  pill when ASIN is null.

## Getting started

### 1. Install

```bash
pnpm install
```

> Note: `pnpm install` ignores the `supabase` package's post-install build
> script by default. To get the local CLI binary, run `pnpm approve-builds`
> and approve `supabase`. Or install the CLI globally via Homebrew / scoop
> and skip the npm package.

### 2. Start Supabase locally

```bash
pnpm db:start         # boots a local Postgres + Studio at :54323
```

The first run applies `supabase/migrations/0001_init.sql` and seeds via
`supabase/seed.sql`.

### 3. Configure env

Copy `.env.example` to `.env.local`. The Supabase CLI prints anon /
service-role keys + URL on `db:start`.

```bash
cp .env.example .env.local
# Paste in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, NEXT_PUBLIC_AMAZON_AFFILIATE_TAG
```

### 4. Run the app

```bash
pnpm dev
```

Visit:

- `/` — landing
- `/contributors` — index, with On Air / Back of House tabs
- `/contributors/jordan-park` — sample kit page
- `/gear` — catalog with category filters
- `/gear/<id>` — detail page with "Also used by"
- `/login` — sign-in (enter email, receive 6-digit code, verify; local emails go to Inbucket at http://127.0.0.1:54324)
- `/kit` — kit editor (requires sign-in; admins can use `?as=<slug>`)
- `/profile` — profile editor (requires sign-in)
- `/admin` — pending-gear queue (requires admin role)

### 5. Reset / reseed

```bash
pnpm db:reset
```

### 6. Regenerate TS types from the live DB

```bash
pnpm db:types
# writes lib/supabase/types.generated.ts
```

Then swap the import in `lib/supabase/{server,client,admin}.ts` to point
at the generated file and delete the hand-written `types.ts`.

## Deploy to Vercel + Supabase

One Supabase project, deployed to Vercel, with migrations applied via
GitHub Actions on every push to `main`. Previews, production, and local
dev all share the same Supabase project — fine for early-stage invite-
only use; move to per-env projects later if/when preview writes start
stepping on production data.

### Prereqs

- GitHub account (you're here)
- Vercel account (free tier is fine)
- Supabase account (free tier is fine for early traffic)
- _[Optional]_ Custom domain and SMTP provider (Resend, Postmark, etc.)

### 1. Create the production Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name: `office-hours-back-of-house` (or whatever).
3. Pick a region close to your audience.
4. Pick a strong DB password — **save it**, you'll need it as a CI
   secret.
5. Wait ~2 minutes for provisioning.
6. Note the **Project ref** (the slug in the dashboard URL, e.g.
   `xyzabc12345`) and the **Project URL** (Settings → API).

### 2. Import the repo into Vercel

1. Go to https://vercel.com/new.
2. Import from GitHub: pick this repo.
3. Framework preset should auto-detect as **Next.js**.
4. **Don't set env vars yet** — the integration in step 3 will sync
   them in.
5. Click **Deploy**. The first build will fail because envs are
   missing. That's expected; you'll redeploy after step 3.

### 3. Install the Vercel ↔ Supabase integration

This is the step that syncs Supabase env vars into Vercel.

1. Go to https://vercel.com/integrations/supabase → **Add integration**.
2. Select your Vercel team + the imported project.
3. Connect to Supabase and pick the project from step 1.
4. The integration writes `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
   into the Vercel project's Production, Preview, and Development envs.

### 4. Add the remaining Vercel env vars

In the Vercel project → Settings → Environment Variables, add:

| Key                                | Env scope              | Example                        |
| ---------------------------------- | ---------------------- | ------------------------------ |
| `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG` | Production + Preview   | `officehoursg-20`              |
| `NEXT_PUBLIC_AMAZON_TLD`           | Production + Preview   | `com`                          |
| `NEXT_PUBLIC_SITE_URL`             | Production only        | `https://yourdomain.com`       |

Leave `NEXT_PUBLIC_SITE_URL` unset for Preview so each preview deploy
uses its own origin for magic-link redirects.

### 5. Configure Supabase Auth URLs

Supabase dashboard → Authentication → URL Configuration:

- **Site URL**: your production URL (e.g. `https://yourdomain.com` or
  the Vercel-assigned URL).
- **Redirect URLs** (allowlist, one per line):
  - `https://yourdomain.com/auth/callback` — production
  - `https://*-<your-vercel-team-slug>.vercel.app/auth/callback` — Vercel previews
  - `http://localhost:3000/auth/callback` — local dev

If you skip the preview wildcard, sign-in will fail on preview URLs.

### 6. _[Recommended]_ Configure SMTP

Supabase's default email sender is rate-limited (a few emails per hour)
and mail often lands in spam. For production, wire a real provider:

- **Resend** (free tier: 100/day) is easiest. Create a Resend account,
  verify a sending domain, generate an API key.
- In Supabase dashboard → Authentication → Emails → SMTP Settings:
  - Host: `smtp.resend.com`
  - Port: `587`
  - Username: `resend`
  - Password: your Resend API key
  - Sender email: `noreply@yourdomain.com`

Without this, you can still use Supabase's default for initial testing.

### 7. Add GitHub Actions secrets for migrations

Repo → Settings → Secrets and variables → Actions → **New repository
secret** for each:

| Secret                  | Where to get it                                                       |
| ----------------------- | --------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → **Generate new token** |
| `SUPABASE_PROJECT_ID`   | Project ref from step 1 (dashboard URL slug)                          |
| `SUPABASE_DB_PASSWORD`  | The DB password you set when creating the project                     |

The workflow is `.github/workflows/db-migrate.yml`. It runs on every
push to `main` that touches `supabase/migrations/**` and on manual
dispatch from the Actions tab.

### 8. First deploy

```bash
git push origin main
```

Three things happen:

1. **Vercel** rebuilds (now with env vars) and deploys.
2. **GitHub Action** links to the Supabase project and applies
   `0001_init.sql` + `0002_storage.sql`.
3. The two storage buckets (`gear-images`, `headshots`) exist as a
   side effect of the migration.

Watch both the Vercel deployment log and the Actions tab to confirm
success.

### 9. Bootstrap the first admin

Production is empty (seeds are local-dev only). To start using it:

1. Visit `https://yourdomain.com/login`.
2. Sign in with your email; type the 6-digit code from the email into the form.
3. The `on_auth_user_created` trigger creates your `public.users` row
   with `role = 'contributor'`.
4. Supabase dashboard → SQL Editor, run:
   ```sql
   -- promote to admin
   update public.users
     set role = 'admin'
     where email = 'you@example.com';

   -- insert your own contributor profile (or skip and do this from /profile as admin)
   insert into public.contributors (name, slug, show_role, role_types, display_order)
     values ('You', 'you', 'Founder', '{on_air,crew}', 0);

   -- link your user to that contributor
   update public.users
     set linked_contributor_id = (select id from public.contributors where slug = 'you')
     where email = 'you@example.com';
   ```
5. Refresh the site — the header now shows Edit kit / Profile / Admin.

### 10. Ongoing schema changes

```bash
# Write a new SQL migration
supabase migration new add_thing
# Edit supabase/migrations/<timestamp>_add_thing.sql

# Test locally
pnpm db:reset

# Merge to main → GitHub Action applies it to production
git push origin main
```

### Troubleshooting

- **Magic link redirects to `localhost` in production** — production URL
  missing from Supabase → Authentication → Redirect URLs.
- **Build fails with `Missing NEXT_PUBLIC_SUPABASE_URL`** — the Vercel
  ↔ Supabase integration didn't apply. Reinstall it, or add the three
  envs manually in the Vercel project settings.
- **Migration workflow fails with an auth error** — rotate
  `SUPABASE_ACCESS_TOKEN` in Supabase account settings and update the
  GitHub secret.
- **Preview deploys can't sign in** — add a wildcard for your Vercel
  team slug to Supabase Redirect URLs.
- **"ERROR: relation 'storage.objects' doesn't exist"** during local
  migration — make sure Supabase local is running (`pnpm db:start`) and
  use `pnpm db:reset` rather than applying SQL files directly.

## Status of every surface

| Surface                  | Status                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Public contributor pages | **Wired.** Anonymous reads via RLS.                                                          |
| Public gear catalog      | **Wired.** `?category=` filter, only shows `status='active'`.                                |
| Typeahead search         | **Wired.** `/api/gear/search?q=...` with ILIKE.                                              |
| OTP-code sign-in         | **Wired.** `/login` has Password + Email-code tabs; code tab sends a 6-digit OTP to verify in-form. |
| Password sign-in         | **Wired.** Email + password via `signInWithPassword`. Create users via Supabase dashboard → Auth → Users → Add user (with Auto Confirm checked). |
| Suggest new gear         | **Wired.** Includes optional product image upload (5MB cap, gear-images bucket).             |
| Admin approve gear       | **Wired.** RLS-enforced; non-admins see a "promote yourself" message.                        |
| Profile editor           | **Wired.** `/profile`. Headshot upload to headshots bucket (path-locked to contributor id).  |
| Gear hero image          | **Wired.** Renders on `/gear/[id]` when `image_url` is set.                                  |
| AI auto-fill             | **Wired.** "Auto-fill with AI" button on both the kit-editor "Create new gear" form and the admin gear editor. Fills brand / name / model / category / description from a short query via Vercel AI Gateway. ASIN and image stay manual. Rate-limited 10/min per user. |
| Admin contributor picker | **Wired.** Admins land on `/kit` or `/profile` and pick which contributor to act as via `?as=<slug>`. |

## Auth flow

`/login` has two tabs: **Password** (default) and **Email code**.

### Password sign-in

1. Admin creates the user via Supabase dashboard → Authentication →
   Users → **Add user** → enter email + password → check
   **Auto Confirm User** → **Create user**. This skips the email-
   verification round-trip so the user can sign in immediately.
2. User visits `/login`, enters email + password → server action calls
   `supabase.auth.signInWithPassword`. Session cookie is set; redirect
   to `next`.

### OTP code sign-in

We use OTP codes (the 6-digit-code-by-email flow) rather than magic
links. Email client prefetchers (Gmail, Outlook, corporate security
scanners) will "preview" links to screen for phishing, which consumes
the one-time token before the user ever clicks. Codes typed by hand
can't be prefetched.

1. User visits `/login` → switches to the **Email code** tab, enters
   email → `sendOtpCodeAction` calls
   `supabase.auth.signInWithOtp({ email })` **without** an
   `emailRedirectTo` — that omission is what tells Supabase to send a
   code instead of a magic link. Supabase emails the 6-digit code.
2. `/login` swaps to the verify step (`?step=verify&email=...&next=...`)
   and prompts for the code.
3. User types the code → `verifyOtpCodeAction` calls
   `supabase.auth.verifyOtp({ email, token, type: 'email' })`. On
   success the session cookie is set by `@supabase/ssr` and the user
   is redirected to `next`.

On every subsequent request, `middleware.ts` refreshes the session
cookie. The async `<SiteHeader />` reads the user via
`getCurrentAppUser` and conditionally renders the right nav links.

### Email template (production)

Supabase's default "Magic Link" email template includes both a
clickable link AND the `{{ .Token }}` variable. Users can use either,
but you probably want to strip the link so they aren't tempted to
click — update the template in **Supabase dashboard → Authentication
→ Emails → Magic Link** to something like:

```html
<h2>Your sign-in code</h2>
<p>Your code for Office Hours: Back of House is:</p>
<p style="font-size: 24px; letter-spacing: 4px; font-weight: bold;">
  {{ .Token }}
</p>
<p>This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
```

### One-time setup for the first admin

Sign in once with your email so a `public.users` row is created (the
`on_auth_user_created` trigger handles this). Then in SQL:

```sql
-- promote to admin
update public.users
  set role = 'admin'
  where email = 'you@example.com';

-- link to a contributor profile (so /kit and /profile target it by default)
update public.users
  set linked_contributor_id = (select id from public.contributors where slug = 'your-slug')
  where email = 'you@example.com';
```

## AI Gateway

The "Auto-fill with AI" button in the kit editor + admin gear editor
calls Vercel AI Gateway to turn a short description ("Sony FX3", "the
black Shure dynamic mic") into structured catalog data. The model uses
Anthropic's built-in `web_search` tool restricted to `amazon.com` to
also find the ASIN and product image for the canonical listing.

### Setup

1. Vercel dashboard → your project → **AI** tab → enable **AI Gateway**.
2. The integration auto-injects credentials for Production + Preview
   environments via OIDC. No env var to set in Vercel.
3. For **local dev**, either:
   - Run `vercel env pull .env.local` to fetch the dev key, or
   - Generate an API key in the AI Gateway dashboard and paste into
     `.env.local` as `AI_GATEWAY_API_KEY=...`.

### What it fills

| Field       | AI fills? | Source                                                              |
| ----------- | --------- | ------------------------------------------------------------------- |
| Brand       | ✅         | LLM reasoning                                                       |
| Name        | ✅         | LLM reasoning                                                       |
| Model       | ✅         | LLM reasoning; best effort. Admin reviews.                          |
| Category    | ✅         | LLM, constrained to the `GEAR_CATEGORIES` enum                      |
| Description | ✅         | LLM; system prompt bans marketing-speak                             |
| **ASIN**    | ✅         | Extracted from `/dp/XXXXXXXXXX` URL via `web_search` on amazon.com  |
| **Image**   | ✅         | Product image URL from Amazon's CDN via `web_search`                |

ASIN + image are **best-effort** — the prompt instructs the model to
return null if it can't confidently identify the listing, and to
prefer items sold by Amazon.com or the brand's own store over
third-party resellers. Admin always reviews before flipping status to
`active`, so wrong ASINs get caught at approval.

### Swapping the model

`lib/ai/gear-enrich.ts` has a single `MODEL_ID` constant
(`anthropic/claude-sonnet-4-5`). Swap to any Claude model that
supports the `web_search_20250305` built-in tool, or rewrite the
integration to use a different provider's search. Sonnet 4.5 was
chosen over Haiku 4.5 because reasoning about "which Amazon listing
is canonical" benefits from the smarter model.

### Backfilling existing catalog entries

If you have gear that predates the AI lookup (or ones where the
lookup failed), `/admin/gear` shows an **AI backfill available** card
at the top with a **Start backfill** button. It processes every item
missing ASIN or image, one at a time, respecting the rate limit with
precise retry timing. Pause/resume/cancel supported. For single-item
retry: the gear edit page has a **"Re-fetch from Amazon"** button
that runs the same lookup using the item's current brand/name/model
(no prompt typing).

### Cost controls

- Per-user rate limit: 30 requests/min (`lib/rate-limit.ts`). Shared
  bucket across kit-editor quick-add, admin re-fetch, and bulk
  backfill.
- Query capped at 500 chars.
- `web_search` capped at 3 uses per call via `maxUses: 3`.
- `allowedDomains: ['amazon.com']` keeps the search focused (and
  avoids paying for tokens on unrelated sites).
- Admin doesn't auto-activate — gear stays `pending` until the admin
  reviews, so wrong ASINs get caught without live affiliate links
  pointing at the wrong product.

Approximate cost per gear item at current Sonnet 4.5 pricing: $0.015–
$0.025 including web_search. 100 backfilled items ≈ $2.

If abuse becomes a concern, swap the in-memory rate limiter for
Vercel KV / Upstash Redis.

## Storage

Two public buckets, both created by `supabase/migrations/0002_storage.sql`:

| Bucket        | Used by              | Path convention             | Write policy                                                                                |
| ------------- | -------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `gear-images` | "Create new gear" UI | `{uuid}-{filename}`         | Any authenticated user can upload. Owner or admin can update/delete.                        |
| `headshots`   | Profile editor       | `{contributorId}/{uuid}-…`  | The linked user (path prefix must equal their `linked_contributor_id`) or admin can upload. |

Both buckets are public read so the public site renders them directly via
plain `<img>` tags. The Supabase URL pattern (`*.supabase.co/storage/v1/object/public/...`)
is already allowlisted in `next.config.ts` for `next/image` if you switch
later. Max upload is 5 MB enforced client-side in `<ImageUploader>`; the
Supabase project enforces its own limit in `config.toml` (50 MiB by
default).

## Scripts

```
pnpm dev          # next dev
pnpm build        # next build
pnpm typecheck    # tsc --noEmit
pnpm db:start     # supabase start
pnpm db:reset     # re-apply migrations + reseed
pnpm db:types     # regenerate TS types from local DB
```
