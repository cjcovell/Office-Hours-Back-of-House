import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import { verifyAsinExists, verifyImageUrl } from "@/lib/amazon-verify";
import { GEAR_CATEGORIES } from "@/lib/categories";

/**
 * AI-assisted gear enrichment with Amazon lookup.
 *
 * Pipeline: one call to Claude Sonnet 4.5 via the Vercel AI Gateway with
 * Anthropic's built-in web_search tool locked to amazon.com. The model:
 *   1. Searches amazon.com for the user's query
 *   2. Finds the canonical listing (prefers Amazon.com / brand's own listing
 *      over third-party sellers)
 *   3. Extracts ASIN from the /dp/ URL pattern
 *   4. Pulls a direct image URL from Amazon's CDN
 *   5. Returns structured data matching the schema below
 *
 * Guardrails:
 *  - ASIN is regex-pinned to 10 uppercase alphanumerics, and the prompt
 *    instructs the model to return null when uncertain. Wrong ASINs route
 *    affiliate clicks to the wrong product — a missing one is strictly
 *    better than a wrong one.
 *  - Admin still reviews before flipping status to 'active'. We never
 *    auto-publish.
 *  - Search is restricted to amazon.com via allowedDomains so the model
 *    doesn't wander into eBay / BHPhotoVideo / sketchy reseller sites.
 */

const CategoryEnum = z.enum(
  GEAR_CATEGORIES as unknown as readonly [string, ...string[]]
);

export const gearEnrichSchema = z.object({
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
  asin: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .nullable()
    .describe(
      "The 10-character ASIN extracted from the Amazon listing's /dp/ URL. " +
        "Return null if you can't confidently identify the canonical listing, " +
        "or if the top result is sold by a third-party seller you don't " +
        "recognize (prefer listings sold by Amazon.com or the brand's own " +
        "official listing). NEVER invent an ASIN — null is strictly better " +
        "than wrong."
    ),
  imageUrl: z
    .string()
    .url()
    .nullable()
    .describe(
      "Direct URL to the product image from Amazon's CDN (hosts like " +
        "m.media-amazon.com or images-na.ssl-images-amazon.com). Return null " +
        "if you don't have a high-confidence image URL."
    ),
});

export type GearEnrichResult = z.infer<typeof gearEnrichSchema>;

const MODEL_ID = "anthropic/claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a catalog assistant for Office Hours Global, a daily broadcast/production show. Contributors describe pieces of gear they use; you return structured catalog metadata plus an Amazon ASIN and image URL.

Procedure:
1. Use web_search to find the product on amazon.com. Queries should be specific: "<brand> <model>" or "<product name> amazon".
2. Look at the top result. It should be the canonical listing for the product.
3. Extract the ASIN from the URL. Amazon URLs contain ASINs in the pattern /dp/XXXXXXXXXX or /gp/product/XXXXXXXXXX — 10 uppercase alphanumeric chars. If you see multiple ASINs across multiple listings, pick the one whose listing matches the brand and model best.
4. Check the seller if visible in search-result snippets. Prefer listings sold by "Amazon.com" or the brand's own store. If the top result is clearly a third-party reseller and you can find an Amazon-sold alternative, prefer that one. If the only results are third-party, return null for asin.
5. Grab the product image URL from the listing if available. Prefer m.media-amazon.com or images-na.ssl-images-amazon.com URLs.

Rules for the structured output:
- Return null for asin if you are not highly confident you have the right product. The contributor would rather have no link than a link to the wrong item.
- Return null for imageUrl if you don't have a direct image URL from Amazon's CDN.
- Description should be plain and factual. No "perfect for" or "unleash your creativity" marketing language.
- category must be one of the enum values exactly — don't invent new categories.`;

// ---------- Focused Amazon lookup (backfill path) ---------------------------
//
// Used when we already have canonical brand/name/model and just want the
// ASIN + image URL. Narrower prompt, narrower schema, same web_search tool.

export const amazonLookupSchema = z.object({
  asin: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .nullable()
    .describe(
      "10-char ASIN from /dp/ URL. NULL if you cannot confidently identify the listing or all top results are third-party resellers."
    ),
  imageUrl: z
    .string()
    .url()
    .nullable()
    .describe(
      "Direct product-image URL from Amazon's CDN (m.media-amazon.com / images-na.ssl-images-amazon.com). NULL if uncertain."
    ),
});

export type AmazonLookupResult = z.infer<typeof amazonLookupSchema>;

const LOOKUP_SYSTEM_PROMPT = `You find Amazon listings for pieces of broadcast/production gear. The caller already knows the brand, product name, and model — your job is to identify the listing on amazon.com and return its ASIN and product image URL.

Procedure:
1. Search amazon.com for "<brand> <model>" (or "<brand> <name>" if the model string is too generic).
2. Look at the top results. Pick the one whose title matches both the brand AND the model.
3. Extract the ASIN from the URL (format: /dp/XXXXXXXXXX — 10 uppercase alphanumeric chars).
4. If visible in snippets, prefer listings sold by Amazon.com or the brand's own storefront over third-party resellers. If the only matches are obviously third-party, return null for asin.
5. Grab the product image URL if available (prefer m.media-amazon.com URLs).

Rules:
- Return null if not highly confident. Wrong ASINs are worse than missing ones.
- Don't invent ASINs.`;

export async function lookupAmazonDetails(params: {
  brand: string;
  name: string;
  model: string;
}): Promise<AmazonLookupResult> {
  const { brand, name, model } = params;
  if (!brand.trim() || !name.trim()) {
    throw new Error("brand and name are required");
  }

  const result = await generateText({
    model: gateway(MODEL_ID),
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 3,
        allowedDomains: ["amazon.com"],
      }),
    },
    system: LOOKUP_SYSTEM_PROMPT,
    prompt: `Brand: ${brand}\nProduct: ${name}\nModel: ${model}`,
    experimental_output: Output.object({ schema: amazonLookupSchema }),
  });

  const raw = result.experimental_output as AmazonLookupResult;
  logToolDiagnostics("lookupAmazonDetails", result, { brand, name, model });
  return await verifyAndCleanAsin(raw, `${brand} ${name} ${model}`);
}

// ---------- Full enrichment (user-query path) -------------------------------

export async function enrichGearFromQuery(
  query: string
): Promise<GearEnrichResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Query is required");
  if (trimmed.length > 500) throw new Error("Query too long (max 500 chars)");

  const result = await generateText({
    model: gateway(MODEL_ID),
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 3,
        allowedDomains: ["amazon.com"],
      }),
    },
    system: SYSTEM_PROMPT,
    prompt: `User query: ${trimmed}`,
    experimental_output: Output.object({ schema: gearEnrichSchema }),
  });

  const raw = result.experimental_output as GearEnrichResult;
  logToolDiagnostics("enrichGearFromQuery", result, { query: trimmed });

  // Verify the AI's ASIN actually resolves on Amazon. If not, null it
  // out (along with imageUrl — if the product page doesn't exist, the
  // image URL is probably from a different product).
  const cleaned = await verifyAndCleanAsin(
    { asin: raw.asin, imageUrl: raw.imageUrl },
    trimmed
  );
  return { ...raw, asin: cleaned.asin, imageUrl: cleaned.imageUrl };
}

// ---------- Verification + diagnostics --------------------------------------

/**
 * Run the AI's proposed ASIN and image URL through real HTTP checks.
 * Discards ASINs that 404 on amazon.com and image URLs that don't
 * resolve to a real image.
 *
 * Coupling rule: if the ASIN fails, we also null out the image — they
 * came from the same AI response, so a hallucinated ASIN implies a
 * hallucinated image. If only the image fails (ASIN valid), we keep
 * the ASIN.
 *
 * Runs verifies in parallel. Adds ~1-2s per call; worth it to avoid
 * saving garbage that gives users broken affiliate links and blue-?
 * image placeholders.
 */
async function verifyAndCleanAsin<
  T extends { asin: string | null; imageUrl: string | null },
>(result: T, context: string): Promise<T> {
  if (!result.asin && !result.imageUrl) return result;

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
      `[gear-enrich] Discarding unverifiable ASIN ${result.asin} for "${context}": ${"reason" in asinVerdict ? asinVerdict.reason : ""} (also clearing image — same AI response)`
    );
    asin = null;
    imageUrl = null;
  } else if (result.imageUrl && !imageVerdict.ok) {
    console.warn(
      `[gear-enrich] Discarding unverifiable image ${result.imageUrl} for "${context}": ${"reason" in imageVerdict ? imageVerdict.reason : ""}`
    );
    imageUrl = null;
  }

  return { ...result, asin, imageUrl };
}

/**
 * Log whether the model actually invoked web_search. Shows up in Vercel
 * function logs. If we see "[gear-enrich] 0 web_search calls" on most
 * requests, the Gateway isn't proxying the Anthropic built-in tool and
 * we need to switch to the direct @ai-sdk/anthropic provider for this
 * path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logToolDiagnostics(fn: string, result: any, ctx: Record<string, string>) {
  // Walk through steps and count tool calls. The parameterized type of
  // generateText's return depends on the tool set; we don't care about
  // the type here, just the call-count signal, so `any` is fine.
  const steps = (result.steps ?? []) as Array<{
    toolCalls?: Array<{ toolName: string }>;
  }>;
  const searchCalls = steps.flatMap((step) =>
    (step.toolCalls ?? []).filter((tc) => tc.toolName === "web_search")
  );

  const ctxStr = Object.entries(ctx)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");

  console.info(
    `[gear-enrich] ${fn}: ${searchCalls.length} web_search calls · ${steps.length} steps · ${ctxStr}`
  );
}
