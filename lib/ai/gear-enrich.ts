import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

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

  return result.experimental_output as AmazonLookupResult;
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

  return result.experimental_output as GearEnrichResult;
}
