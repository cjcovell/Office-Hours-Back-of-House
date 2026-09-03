# SerpAPI ASIN Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile Amazon page-scraping with SerpAPI lookup for bulk ASIN verification so valid ASINs stop getting cleared.

**Architecture:** Add `verifyAsinViaSerpApi()` to `lib/amazon-verify.ts` that calls the existing `searchAmazonViaSerpApi()`. Swap it into `verifyGearAsinAction()` in `app/admin/gear/actions.ts`. Keep `verifyAsinExists()` for single-item use in enrichment and diagnostics.

**Tech Stack:** Next.js 15 server actions, SerpAPI (`lib/serpapi.ts`), Supabase admin client.

**Spec:** `docs/superpowers/specs/2026-04-15-serpapi-asin-verification-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/amazon-verify.ts` | Modify | Add `verifyAsinViaSerpApi()` function |
| `app/admin/gear/actions.ts` | Modify (lines 7-11, 240-243) | Swap verification call in `verifyGearAsinAction()` |

---

### Task 1: Add `verifyAsinViaSerpApi()` to `lib/amazon-verify.ts`

**Files:**
- Modify: `lib/amazon-verify.ts` (add new function after line 132)

- [ ] **Step 1: Add import for `searchAmazonViaSerpApi`**

At the top of `lib/amazon-verify.ts`, add:

```typescript
import { searchAmazonViaSerpApi } from "@/lib/serpapi";
```

- [ ] **Step 2: Add `verifyAsinViaSerpApi` function after `verifyAsinExists`**

Insert after the closing brace of `verifyAsinExists()` (after line 132):

```typescript
/**
 * Verify an ASIN exists by searching for it via SerpAPI. More reliable than
 * direct page scraping because SerpAPI handles Amazon's bot detection and
 * returns authoritative search-index data.
 *
 * Key safety rule: if SerpAPI itself errors (network, rate limit, missing
 * key), we return ok:true — ambiguity preserves data, never destroys it.
 * The admin can re-run verification later.
 */
export async function verifyAsinViaSerpApi(
  asin: string
): Promise<AsinVerification> {
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return { ok: false, reason: "malformed ASIN" };
  }

  try {
    const result = await searchAmazonViaSerpApi(asin);

    if (!result) {
      return { ok: false, reason: "ASIN not found in Amazon search" };
    }

    if (result.asin.toUpperCase() === asin.toUpperCase()) {
      return { ok: true };
    }

    // SerpAPI returned a result but with a different ASIN — the search
    // matched something else. Treat as not found.
    return {
      ok: false,
      reason: `search returned different ASIN: ${result.asin}`,
    };
  } catch (err) {
    // SerpAPI failure (network, rate limit, missing key). Preserve data —
    // a transient API error should never clear a potentially valid ASIN.
    console.warn(
      `[verifyAsinViaSerpApi] SerpAPI error for ${asin}, preserving data:`,
      err instanceof Error ? err.message : err
    );
    return { ok: true };
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors in `lib/amazon-verify.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/amazon-verify.ts
git commit -m "feat: add SerpAPI-based ASIN verification function

Adds verifyAsinViaSerpApi() as a reliable alternative to direct Amazon
page scraping. On SerpAPI errors, preserves existing data rather than
clearing it.

Addresses feedback: 'Verify Existing ASIN clearing valid entries'"
```

---

### Task 2: Swap verification call in `verifyGearAsinAction()`

**Files:**
- Modify: `app/admin/gear/actions.ts` (lines 7-11, 240-243)

- [ ] **Step 1: Update import**

In `app/admin/gear/actions.ts`, change the import from `@/lib/amazon-verify`:

```typescript
// Before:
import {
  isAmazonImageUrl,
  verifyAsinExists,
  verifyImageUrl,
} from "@/lib/amazon-verify";

// After:
import {
  isAmazonImageUrl,
  verifyAsinViaSerpApi,
  verifyImageUrl,
} from "@/lib/amazon-verify";
```

- [ ] **Step 2: Swap the call in `verifyGearAsinAction()`**

In the `Promise.all` block (around line 240), replace `verifyAsinExists` with `verifyAsinViaSerpApi`:

```typescript
// Before:
const [asinVerdict, imageVerdict] = await Promise.all([
  gear.asin
    ? verifyAsinExists(gear.asin)
    : Promise.resolve({ ok: true as const }),
  shouldVerifyImage
    ? verifyImageUrl(gear.image_url!)
    : Promise.resolve({ ok: true as const }),
]);

// After:
const [asinVerdict, imageVerdict] = await Promise.all([
  gear.asin
    ? verifyAsinViaSerpApi(gear.asin)
    : Promise.resolve({ ok: true as const }),
  shouldVerifyImage
    ? verifyImageUrl(gear.image_url!)
    : Promise.resolve({ ok: true as const }),
]);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/gear/actions.ts
git commit -m "fix: use SerpAPI for bulk ASIN verification instead of direct scraping

Direct Amazon page scraping was unreliable — CAPTCHAs and markup
variations caused valid ASINs to fail verification and get cleared.
SerpAPI provides authoritative search-index data without scraping.

verifyAsinExists() is retained for single-item use in enrichment
and diagnostics where it works fine (one-off requests are less
likely to trigger bot detection).

Fixes feedback: 'Verify Existing ASIN clearing valid entries'"
```

---

### Task 3: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test in browser**

1. Navigate to `/admin/gear`
2. Click "Verify existing ASINs"
3. Confirm that items with known-valid ASINs are reported as "valid" (not cleared)
4. Check the terminal for any `[verifyAsinViaSerpApi]` warnings (should be none under normal conditions)

- [ ] **Step 3: Verify no data was cleared**

Check the database — all previously valid ASINs should still be intact.
