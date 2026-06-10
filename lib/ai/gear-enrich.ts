import { generateText, Output } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import {
  type AsinVerification,
  verifyImageUrl,
} from "@/lib/amazon-verify";
import { GEAR_CATEGORIES } from "@/lib/categories";
import {
  buildAmazonSearchQuery,
  SerpApiError,
  searchAmazonViaSerpApi,
} from "@/lib/serpapi";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Gear enrichment pipeline.
 *
 * Split responsibilities:
 *  - **AI (Claude Haiku via Gateway)** — text enrichment only. Takes a
 *    short user query ("Sony FX3") and produces structured text fields:
 *    brand, name, model, category, description. No ASINs, no image
 *    URLs — the AI does not see Amazon listings and cannot hallucinate
 *    product IDs.
 *  - **SerpAPI (Amazon Search)** — real product lookup. Given the
 *    canonical brand/model from the AI (or from an existing gear row),
 *    runs an actual Amazon search and returns real ASIN + image URL
 *    from search results.
 *  - **Image verification** — a cheap HEAD check against Amazon's CDN
 *    before saving an image URL. Broken images directly degrade the UI
 *    (blue-? placeholders), and the check is reliable: CDNs don't
 *    bot-block HEAD requests the way product pages do.
 *
 * ASINs from SerpAPI are trusted as-is: they come from a live Amazon
 * search seconds earlier, which is stronger evidence than anything we
 * can get by re-fetching amazon.com from a datacenter IP (Amazon
 * serves bots different HTML, which gave us both false positives and
 * false negatives when we scrape-verified). Stale/delisted ASINs are
 * caught by the admin review step (the pending row shows a clickable
 * URL preview) and by the bulk "Verify existing" action, which checks
 * via SerpAPI search.
 *
 * We previously tried AI + built-in web_search. Models hallucinated
 * ASINs even with tool access, and server-side Amazon fetches return
 * different HTML than browsers see, making verification fragile. The
 * SerpAPI split removes the guessing entirely.
 */

// ---------- Public schemas --------------------------------------------------

const CategoryEnum = z.enum(
  GEAR_CATEGORIES as unknown as readonly [string, ...string[]]
);

export const gearEnrichSchema = z.object({
  brand: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  model: z.string().min(1).max(80),
  category: CategoryEnum,
  description: z.string().min(1).max(400),
  asin: z.string().regex(/^[A-Z0-9]{10}$/).nullable(),
  imageUrl: z.string().url().nullable(),
});

export type GearEnrichResult = z.infer<typeof gearEnrichSchema>;

export const amazonLookupSchema = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/).nullable(),
  imageUrl: z.string().url().nullable(),
});

export type AmazonLookupResult = z.infer<typeof amazonLookupSchema>;

// ---------- Models ----------------------------------------------------------

// Haiku is plenty for text extraction — no reasoning-heavy work now
// that we've moved ASIN lookup out of the LLM's hands. ~5× cheaper
// than Sonnet per call.
const TEXT_MODEL_ID = "anthropic/claude-haiku-4-5";

// ---------- Text-enrichment schema (AI only, no Amazon data) ----------------

const gearTextSchema = z.object({
  brand: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Manufacturer brand, e.g. 'Sony', 'Shure', 'Blackmagic Design'"
    ),
  name: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "Canonical product name without the brand, e.g. 'FX3 Full-Frame Cinema Camera'"
    ),
  model: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Specific model number or SKU, e.g. 'ILME-FX3'. Best-effort if unsure."
    ),
  category: CategoryEnum.describe(
    "Best-fit category from the provided enum. Don't propose new categories."
  ),
  description: z
    .string()
    .min(1)
    .max(400)
    .describe(
      "One or two factual sentences about what it is and what it's used for in broadcast/production. No marketing adjectives."
    ),
});

type GearTextResult = z.infer<typeof gearTextSchema>;

const TEXT_SYSTEM_PROMPT = `You are a catalog assistant for Office Hours Global, a daily broadcast/production show. Contributors describe pieces of gear; you produce structured catalog text.

Return brand, canonical product name, specific model/SKU, a best-fit category from the enum, and a short factual description.

Rules:
- Descriptions are plain and factual. No "perfect for" or "unleash your creativity" marketing language.
- category must be exactly one of the enum values — don't invent new categories.
- Do NOT invent specifics you're unsure about. Admin reviews everything.`;

// ---------- Focused Amazon lookup (backfill / re-fetch) ---------------------

/**
 * Look up a product on Amazon via SerpAPI given its canonical
 * brand/name/model. The ASIN comes straight from live search results;
 * the image URL is HEAD-verified against Amazon's CDN before being
 * returned. Nulls if nothing matched.
 */
export async function lookupAmazonDetails(params: {
  brand: string;
  name: string;
  model: string;
}): Promise<AmazonLookupResult> {
  const { brand, name, model } = params;
  if (!brand.trim() || !name.trim()) {
    throw new Error("brand and name are required");
  }

  const query = buildAmazonSearchQuery({ brand, name, model });
  const start = Date.now();

  let serp;
  try {
    serp = await searchAmazonViaSerpApi(query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(`[gear-enrich] SerpAPI error for "${query}": ${msg}`);
    void logAiCall({
      fn: "lookupAmazonDetails",
      query,
      durationMs: Date.now() - start,
      error: msg,
    });
    throw err;
  }

  if (!serp) {
    // No results for this query. Not an error — just nothing to save.
    void logAiCall({
      fn: "lookupAmazonDetails",
      query,
      durationMs: Date.now() - start,
      aiReturnedAsin: null,
      aiReturnedImage: null,
      finalAsin: null,
      finalImage: null,
    });
    return { asin: null, imageUrl: null };
  }

  const [finalImage, imageVerdict] = await verifyImageWithDiagnostics(
    serp.imageUrl,
    query
  );

  void logAiCall({
    fn: "lookupAmazonDetails",
    query,
    durationMs: Date.now() - start,
    aiReturnedAsin: serp.asin,
    aiReturnedImage: serp.imageUrl,
    imageVerdict,
    finalAsin: serp.asin,
    finalImage,
  });

  return { asin: serp.asin, imageUrl: finalImage };
}

// ---------- Full enrichment (kit-editor quick-add) --------------------------

/**
 * Given a vague user query ("Sony FX3", "the black Shure mic"), produce
 * full structured catalog data: AI for text fields, SerpAPI for ASIN +
 * image, HTTP verify before returning.
 *
 * If SerpAPI fails (no key, rate limit, no match), returns text fields
 * with asin/imageUrl as null — admin can enter them manually.
 */
export async function enrichGearFromQuery(
  query: string
): Promise<GearEnrichResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Query is required");
  if (trimmed.length > 500) throw new Error("Query too long (max 500 chars)");

  const start = Date.now();

  // Step 1: AI text enrichment.
  let textResult: GearTextResult;
  try {
    const result = await generateText({
      model: gateway(TEXT_MODEL_ID),
      system: TEXT_SYSTEM_PROMPT,
      prompt: `User query: ${trimmed}`,
      experimental_output: Output.object({ schema: gearTextSchema }),
    });
    textResult = result.experimental_output as GearTextResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    void logAiCall({
      fn: "enrichGearFromQuery",
      query: trimmed,
      durationMs: Date.now() - start,
      error: msg,
    });
    throw err;
  }

  // Step 2: SerpAPI lookup using the canonicalized brand/model.
  // SerpAPI failures here are non-fatal — we still return the text
  // fields so the admin has something to work with.
  const searchQuery = buildAmazonSearchQuery({
    brand: textResult.brand,
    name: textResult.name,
    model: textResult.model,
  });

  let serpAsin: string | null = null;
  let serpImage: string | null = null;
  let serpError: string | undefined;
  try {
    const serp = await searchAmazonViaSerpApi(searchQuery);
    if (serp) {
      serpAsin = serp.asin;
      serpImage = serp.imageUrl;
    }
  } catch (err) {
    // All lookup errors (SerpAPI or otherwise) are swallowed so the
    // text fields still come back — the admin can fill ASIN manually.
    // The error is recorded in ai_call_logs either way, so bugs stay
    // visible on /admin/ai-logs.
    serpError = err instanceof Error ? err.message : "unknown";
    const kind = err instanceof SerpApiError ? "SerpAPI" : "Unexpected";
    console.warn(
      `[gear-enrich] ${kind} error during lookup for "${searchQuery}": ${serpError}`
    );
  }

  // Step 3: Verify the image URL before saving it.
  const [finalImage, imageVerdict] = await verifyImageWithDiagnostics(
    serpImage,
    searchQuery
  );

  void logAiCall({
    fn: "enrichGearFromQuery",
    query: trimmed,
    durationMs: Date.now() - start,
    aiReturnedAsin: serpAsin,
    aiReturnedImage: serpImage,
    imageVerdict,
    finalAsin: serpAsin,
    finalImage,
    error: serpError,
  });

  return {
    ...textResult,
    asin: serpAsin,
    imageUrl: finalImage,
  };
}

// ---------- Verification ----------------------------------------------------

/**
 * HEAD-check an image URL against Amazon's CDN before saving. Returns
 * the URL (or null if it didn't verify) plus the verdict for telemetry.
 *
 * ASINs are intentionally NOT re-verified here — see the module header.
 */
async function verifyImageWithDiagnostics(
  imageUrl: string | null,
  context: string
): Promise<[string | null, AsinVerification | { ok: true }]> {
  if (!imageUrl) return [null, { ok: true }];

  const verdict = await verifyImageUrl(imageUrl);
  if (verdict.ok) return [imageUrl, verdict];

  console.warn(
    `[gear-enrich] Discarding unverifiable image ${imageUrl} for "${context}": ${verdict.reason}`
  );
  return [null, verdict];
}

// ---------- Telemetry ------------------------------------------------------

/**
 * Fire-and-forget telemetry write to public.ai_call_logs. Failures are
 * swallowed — logging must never break the caller's lookup.
 *
 * The table schema predates the SerpAPI swap; the web_search-specific
 * columns (step_count, web_search_calls) are left null now. Rename /
 * clean up later if the column list drifts further.
 */
async function logAiCall(params: {
  fn: string;
  query: string;
  durationMs: number;
  aiReturnedAsin?: string | null;
  aiReturnedImage?: string | null;
  imageVerdict?: AsinVerification | { ok: true };
  finalAsin?: string | null;
  finalImage?: string | null;
  error?: string;
}): Promise<void> {
  try {
    const me = await getCurrentAppUser().catch(() => null);
    const client = createSupabaseAdminClient();

    await client.from("ai_call_logs").insert({
      user_id: me?.authId ?? null,
      fn: params.fn,
      query: params.query,
      model_id: params.fn === "enrichGearFromQuery" ? TEXT_MODEL_ID : "serpapi",
      duration_ms: params.durationMs ?? null,
      step_count: null,
      web_search_calls: null,
      ai_returned_asin: params.aiReturnedAsin ?? null,
      ai_returned_image: params.aiReturnedImage ?? null,
      // ASINs come from SerpAPI's live search and aren't independently
      // re-verified (see module header), so asin_verified stays null.
      asin_verified: null,
      asin_fail_reason: null,
      image_verified:
        params.imageVerdict === undefined || !params.aiReturnedImage
          ? null
          : params.imageVerdict.ok,
      image_fail_reason:
        params.imageVerdict && !params.imageVerdict.ok && "reason" in params.imageVerdict
          ? params.imageVerdict.reason
          : null,
      final_asin: params.finalAsin ?? null,
      final_image: params.finalImage ?? null,
      error: params.error ?? null,
    });
  } catch (err) {
    console.warn(
      `[gear-enrich] Failed to log AI call: ${err instanceof Error ? err.message : err}`
    );
  }
}
