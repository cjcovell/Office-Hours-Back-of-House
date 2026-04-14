import { generateText, Output } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import {
  type AsinVerification,
  verifyAsinExists,
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
 *  - **Amazon HTTP verification** — final sanity check. Both the ASIN
 *    and the image URL are HEAD/GET-tested against amazon.com before
 *    writing to the DB. SerpAPI is reliable, but products get delisted
 *    and stale results linger.
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
 * brand/name/model. Returns a verified ASIN + image URL, or nulls if
 * nothing matched or verification failed.
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

  const [cleaned, verdicts] = await verifyAndCleanAsinWithDiagnostics(
    { asin: serp.asin, imageUrl: serp.imageUrl },
    query
  );

  void logAiCall({
    fn: "lookupAmazonDetails",
    query,
    durationMs: Date.now() - start,
    aiReturnedAsin: serp.asin,
    aiReturnedImage: serp.imageUrl,
    asinVerdict: verdicts.asin,
    imageVerdict: verdicts.image,
    finalAsin: cleaned.asin,
    finalImage: cleaned.imageUrl,
  });

  return cleaned;
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
    serpError = err instanceof Error ? err.message : "unknown";
    if (!(err instanceof SerpApiError)) {
      // Re-throw unexpected errors so we notice bugs; SerpApiErrors are
      // logged and swallowed so the text fields still come back.
      console.warn(
        `[gear-enrich] Non-SerpApi error during lookup: ${serpError}`
      );
    } else {
      console.warn(`[gear-enrich] SerpAPI error for "${searchQuery}": ${serpError}`);
    }
  }

  // Step 3: Verify whatever SerpAPI gave us.
  const [cleaned, verdicts] = await verifyAndCleanAsinWithDiagnostics(
    { asin: serpAsin, imageUrl: serpImage },
    searchQuery
  );

  void logAiCall({
    fn: "enrichGearFromQuery",
    query: trimmed,
    durationMs: Date.now() - start,
    aiReturnedAsin: serpAsin,
    aiReturnedImage: serpImage,
    asinVerdict: verdicts.asin,
    imageVerdict: verdicts.image,
    finalAsin: cleaned.asin,
    finalImage: cleaned.imageUrl,
    error: serpError,
  });

  return {
    ...textResult,
    asin: cleaned.asin,
    imageUrl: cleaned.imageUrl,
  };
}

// ---------- Verification ----------------------------------------------------

/**
 * Run the proposed ASIN + image URL through real HTTP checks against
 * amazon.com. Returns the cleaned values AND the individual verdicts
 * so the caller can persist them for telemetry.
 *
 * Coupling rule: if the ASIN fails verification, also null out the
 * image — they were returned together by the same SerpAPI result, so
 * a bad ASIN means a bad/wrong image. If only the image fails (ASIN
 * verified fine), keep the ASIN.
 */
async function verifyAndCleanAsinWithDiagnostics<
  T extends { asin: string | null; imageUrl: string | null },
>(
  result: T,
  context: string
): Promise<
  [
    T,
    {
      asin: AsinVerification | { ok: true };
      image: AsinVerification | { ok: true };
    },
  ]
> {
  const [asinVerdict, imageVerdict] = await Promise.all([
    result.asin
      ? verifyAsinExists(result.asin)
      : Promise.resolve({ ok: true as const }),
    result.imageUrl
      ? verifyImageUrl(result.imageUrl)
      : Promise.resolve({ ok: true as const }),
  ]);

  let asin = result.asin;
  let imageUrl = result.imageUrl;

  if (result.asin && !asinVerdict.ok) {
    console.warn(
      `[gear-enrich] Discarding unverifiable ASIN ${result.asin} for "${context}": ${"reason" in asinVerdict ? asinVerdict.reason : ""} (also clearing image)`
    );
    asin = null;
    imageUrl = null;
  } else if (result.imageUrl && !imageVerdict.ok) {
    console.warn(
      `[gear-enrich] Discarding unverifiable image ${result.imageUrl} for "${context}": ${"reason" in imageVerdict ? imageVerdict.reason : ""}`
    );
    imageUrl = null;
  }

  return [
    { ...result, asin, imageUrl },
    { asin: asinVerdict, image: imageVerdict },
  ];
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
  asinVerdict?: AsinVerification | { ok: true };
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
      asin_verified:
        params.asinVerdict === undefined || !params.aiReturnedAsin
          ? null
          : params.asinVerdict.ok,
      asin_fail_reason:
        params.asinVerdict && !params.asinVerdict.ok && "reason" in params.asinVerdict
          ? params.asinVerdict.reason
          : null,
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
