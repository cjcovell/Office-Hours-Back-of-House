# Office Hours: Back of House — TODO

Scratch list of outstanding work. Split by owner — the YOU section is
things only you can do (credentials, signups, manual clicks); the DEV
section is code changes I can ship when you say go.

This file lives on branch `claude/boh-ai-logs-and-polish`. The dev
items below should land on that branch (or a topic branch cut from
it) so they ship independently of whatever's happening on the active
feature branch.

---

## YOU — action items

### Now (unblocks the catalog)

- [ ] **Sign up for SerpAPI** — https://serpapi.com/. Free tier is
      plenty for the initial ~150-item backfill.
- [ ] **Grab an API key** from the SerpAPI dashboard.
- [ ] **Add `SERPAPI_API_KEY` to Vercel env vars** — project → Settings
      → Environment Variables → add for Production + Preview. Redeploy
      (or push anything to main and the next deploy picks it up).
- [ ] **Sanity check**: visit
      `/api/admin/ai/diagnose?q=Sony+FX3` signed in as admin. Expect
      JSON with `diagnosis.verdict` starting with "Healthy:".
- [ ] **Wipe + refill**: `/admin/gear` → **Clear all AI data** →
      confirm → **Backfill missing**. Watch the progress bar.
- [ ] **Spot-check**: click a few gear rows, verify the Amazon links
      now go to real products and images render.

### Soon

- [ ] **Copy `SERPAPI_API_KEY` to your `.env.local`** too, so local
      dev works. (`vercel env pull .env.local` if you like.)
- [ ] **Decide what to do with items SerpAPI can't find** — some
      obscure gear won't match. Either paste the ASIN from SiteStripe
      manually on the pending row, or leave null (no affiliate link).

### Longer term

- [ ] **Qualify as an Amazon Associate** — 10 qualified sales in
      trailing 30 days once you have an affiliate tag live. Required
      for both PA-API (deprecating 2026-04-30) and the Creators API.
- [ ] **Get an affiliate tag** and set `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG`
      in Vercel env vars. The code already appends `?tag=...` to
      Amazon links when this is set (see `lib/amazon.ts`).
- [ ] Once qualified: ping me to swap `lib/serpapi.ts` for the
      Creators API (see dev item below).

---

## DEV — remaining work on the project

### Priority 1 — finish the log viewer I promised

- [ ] **`/admin/ai-logs` page** — the `ai_call_logs` table is already
      populated on every enrichment call (see migration `0005`). Build
      an admin-only page that lists recent rows with columns:
      timestamp, fn, query, duration, ai-returned asin, asin_verified,
      final asin, error. Filters: fn, verified/failed/error. Links to
      gear row if `final_asin` is set.
- [ ] **Link from `/admin`** to the new page.

### Priority 2 — UX when SerpAPI isn't set up yet

- [ ] **Detect missing `SERPAPI_API_KEY` at server render time** on
      `/admin/gear`. If absent, show a banner above the enrichment
      tools card: "SerpAPI not configured — Backfill will fail until
      you add `SERPAPI_API_KEY`. See docs."
- [ ] **Graceful degradation in the SerpAPI client** — when the key is
      missing, return `null` with a structured warning instead of
      throwing. This lets the kit-editor quick-add still succeed with
      text fields even without SerpAPI configured.

### Priority 3 — small polish

- [ ] **Split rate-limit buckets** — AI calls and SerpAPI calls share a
      30/min bucket right now (`ai-gear-enrich`). Give SerpAPI its own
      bucket with a higher ceiling since it's faster + different cost.
- [ ] **Drop stale web_search references** in code comments and the
      README from before the SerpAPI swap. Tidy-up, not behavioral.
- [ ] **Consider dropping the "Verify existing ASINs" action** — useful
      during the AI-hallucination cleanup, mostly redundant now that
      SerpAPI returns real data. Or keep as a monthly safety net for
      catching products that get delisted after save.

### Priority 4 — conditional on Associate qualification

- [ ] **Swap SerpAPI → Amazon Creators API** once you qualify. New
      provider file (`lib/amazon-creators.ts`?) with the same
      `searchAmazonViaSerpApi` interface. Swap the import in
      `lib/ai/gear-enrich.ts`. No call-site changes needed; same input
      shape, same output shape, same verify pipeline.
- [ ] **Optional: keep SerpAPI as a fallback** if Creators API rate
      limits are tight (1 req/sec initially).

### Priority 5 — nice-to-haves

- [ ] **Scheduled re-verification** — weekly cron that runs
      `verifyGearAsinAction` across the catalog to catch delisted
      products. Would live in `app/api/cron/verify-gear/route.ts`
      behind a Vercel Cron + CRON_SECRET check.
- [ ] **SerpAPI usage dashboard** on the admin page — count lookups
      per day from the `ai_call_logs` table so you can see credit
      burn rate.
- [ ] **Admin CSV export** of the catalog — sometimes easier to audit
      in a spreadsheet than row-by-row.

---

## Out of scope / deferred

- PA-API (deprecating 2026-04-30 — don't build on it).
- Scraping Amazon directly with headless browsers (too fragile, too
  much infra).
- Building our own product database (overkill).

---

## Where the code lives

| Concern | File |
| --- | --- |
| SerpAPI client | `lib/serpapi.ts` |
| AI text enrichment + pipeline orchestration | `lib/ai/gear-enrich.ts` |
| Amazon URL verification | `lib/amazon-verify.ts` |
| Affiliate URL builder | `lib/amazon.ts` |
| Admin bulk operations (wipe, backfill, verify) | `components/admin-bulk-backfill.tsx` + `app/admin/gear/actions.ts` |
| Telemetry table | `supabase/migrations/0005_ai_call_logs.sql` |
| Diagnostic endpoint | `app/api/admin/ai/diagnose/route.ts` |
