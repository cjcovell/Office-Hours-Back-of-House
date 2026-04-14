import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import { GEAR_CATEGORIES } from "@/lib/categories";

/**
 * AI-assisted gear enrichment.
 *
 * Given a short free-text query ("Sony FX3", "the black Shure dynamic mic",
 * an Amazon product title, etc.), returns structured catalog data suitable
 * for pre-filling the gear create/edit forms.
 *
 * ASIN is deliberately NOT requested — models hallucinate 10-character codes
 * and getting one wrong would mis-route affiliate clicks. Humans still enter
 * ASINs by hand.
 *
 * Image is not requested either — text models can't produce product photos.
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
      "The manufacturer brand name, e.g. 'Sony', 'Shure', 'Blackmagic Design'"
    ),
  name: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "The canonical product name without the brand, e.g. 'FX3 Full-Frame Cinema Camera'"
    ),
  model: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "The specific model number or SKU, e.g. 'ILME-FX3'. If unsure, return the most specific identifier you know."
    ),
  category: CategoryEnum.describe(
    "The best-fit category for this gear, chosen strictly from the provided enum."
  ),
  description: z
    .string()
    .min(1)
    .max(400)
    .describe(
      "One or two sentences of plain factual description. No marketing adjectives, no 'perfect for' framing. Explain what it is and what it's commonly used for in broadcast/production."
    ),
});

export type GearEnrichResult = z.infer<typeof gearEnrichSchema>;

const MODEL_ID = "anthropic/claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a catalog assistant for Office Hours Global, a daily broadcast/production show. Contributors describe pieces of gear they use at home or in the rack room, and you return structured catalog metadata.

Rules:
- Be accurate. If you're not sure of a specific model number, give your best guess but don't invent SKUs that sound plausible but aren't real.
- Pick the single best-fit category from the enum. Don't propose new categories.
- Description should be plain and factual. One or two sentences. No marketing-speak ("perfect for", "unleash your creativity", etc.). Just: what it is, what it's used for.
- If the user's query is ambiguous (e.g. just "Sony camera"), pick the most likely canonical product given the context of broadcast/production.
- Never include price information.`;

export async function enrichGearFromQuery(
  query: string
): Promise<GearEnrichResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Query is required");
  if (trimmed.length > 500) throw new Error("Query too long (max 500 chars)");

  const { object } = await generateObject({
    model: gateway(MODEL_ID),
    schema: gearEnrichSchema,
    system: SYSTEM_PROMPT,
    prompt: `User description: ${trimmed}`,
  });

  return object as GearEnrichResult;
}
