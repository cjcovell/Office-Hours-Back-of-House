# SerpAPI-based ASIN Verification

**Date:** 2026-04-15
**Feedback ID:** `1fd6e32d-6d9b-4b30-bf54-052093a7e9a8`

## Problem

The "Verify Existing ASIN" bulk action in `/admin/gear` clears valid ASINs.
`verifyAsinExists()` in `lib/amazon-verify.ts` scrapes `amazon.com/dp/{ASIN}`
and checks for positive product-page markers (`data-asin`, `id="productTitle"`,
etc.). Amazon frequently serves CAPTCHAs, minimal HTML, or A/B-tested markup to
server-side requests, causing valid ASINs to fail marker checks. When
verification fails, `verifyGearAsinAction()` sets both `asin` and `image_url` to
`null` — destroying good data.

## Solution

Replace direct Amazon scraping with a SerpAPI Amazon search for verification.
SerpAPI returns authoritative results from Amazon's search index; if the ASIN
appears in results, it is real. The project already uses SerpAPI for ASIN lookup
(`lib/serpapi.ts`), so infrastructure and billing are in place.

## Design

### New function: `verifyAsinViaSerpApi(asin: string)`

Location: `lib/amazon-verify.ts`

1. Format-validate the ASIN (`/^[A-Z0-9]{10}$/`).
2. Call `searchAmazonViaSerpApi(asin)` from `lib/serpapi.ts`.
3. If any result's `.asin` matches our ASIN exactly (case-insensitive) →
   `{ ok: true }`.
4. If no match → `{ ok: false, reason: "ASIN not found in Amazon search" }`.
5. If SerpAPI throws (network error, rate limit, missing key) → return
   `{ ok: true }` — **ambiguity preserves data, never destroys it.** Log a
   warning so the admin can investigate.

### Changes to `verifyGearAsinAction()` (actions.ts)

- Replace `verifyAsinExists(gear.asin)` call with `verifyAsinViaSerpApi(gear.asin)`.
- Adjust rate-limit bucket params if needed (SerpAPI has its own rate limits).
- Image verification (`verifyImageUrl`) stays unchanged — HEAD requests are
  reliable.

### Files touched

| File | Change |
|------|--------|
| `lib/amazon-verify.ts` | Add `verifyAsinViaSerpApi()`. Keep `verifyAsinExists()` for potential single-item diagnostic use. |
| `app/admin/gear/actions.ts` | Swap `verifyAsinExists` → `verifyAsinViaSerpApi` in `verifyGearAsinAction()`. |

### What stays the same

- `verifyImageUrl()` — unchanged.
- `searchAmazonViaSerpApi()` in `lib/serpapi.ts` — reused as-is.
- `components/admin-bulk-backfill.tsx` — no client changes needed.

## Key principle

**When verification is inconclusive, preserve existing data.** The cost of a
false negative (clearing a valid ASIN) is higher than the cost of a false
positive (keeping a bad ASIN that can be re-verified later).
