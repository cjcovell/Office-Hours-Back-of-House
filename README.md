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
- **Supabase**: Postgres + Auth (magic links) + Storage
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
  login/page.tsx               Magic-link sign-in form
  login/actions.ts             sendMagicLink + signOut server actions
  auth/callback/route.ts       OAuth code -> session exchange
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
- `/kit?as=sam-rivera` — kit editor demo (auth stubbed; see below)
- `/admin` — pending-gear queue (admin role required for writes)

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

## Status of every surface

| Surface                  | Status                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Public contributor pages | **Wired.** Anonymous reads via RLS.                                                          |
| Public gear catalog      | **Wired.** `?category=` filter, only shows `status='active'`.                                |
| Typeahead search         | **Wired.** `/api/gear/search?q=...` with ILIKE.                                              |
| Magic-link sign-in       | **Wired.** `/login` sends, `/auth/callback` exchanges, header shows email + Sign out.        |
| Suggest new gear         | **Wired.** Includes optional product image upload (5MB cap, gear-images bucket).             |
| Admin approve gear       | **Wired.** RLS-enforced; non-admins see a "promote yourself" message.                        |
| Profile editor           | **Wired.** `/profile`. Headshot upload to headshots bucket (path-locked to contributor id).  |
| Gear hero image          | **Wired.** Renders on `/gear/[id]` when `image_url` is set.                                  |
| Admin contributor picker | **Wired.** Admins land on `/kit` or `/profile` and pick which contributor to act as via `?as=<slug>`. |

## Auth flow

1. User visits a protected page (`/kit`, `/admin`, `/profile`) or clicks
   **Sign in** in the header → routed to `/login?next=<wherever>`.
2. They submit their email → `sendMagicLinkAction` calls
   `supabase.auth.signInWithOtp` with `emailRedirectTo` pointing at
   `/auth/callback?next=<dest>`. The page swaps to a "Check your email"
   state.
3. They click the link in the email (locally, find it in Supabase's
   built-in Inbucket at `http://127.0.0.1:54324`) → `/auth/callback?code=...`.
4. The route handler calls `exchangeCodeForSession`, sets cookies via
   `@supabase/ssr`, and redirects to the original destination.
5. On every subsequent request, `middleware.ts` refreshes the session
   cookie. The async `<SiteHeader />` reads the user via
   `getCurrentAppUser` and conditionally renders the right nav links.

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
