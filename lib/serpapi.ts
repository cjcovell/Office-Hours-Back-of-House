import { z } from "zod";

/**
 * SerpAPI client for Amazon product search.
 *
 * Why SerpAPI: the AI-plus-web-search approach we tried first was
 * unreliable — LLMs hallucinate 10-char strings that shape-match
 * ASINs but point to no real product. SerpAPI runs an actual Amazon
 * search and returns the real ASINs + image URLs from the search
 * results page. No hallucinations possible.
 *
 * Pricing at time of writing: free tier + ~$10-25 per 1,000 searches
 * on paid plans. For ~150 items this is well under $5 total.
 *
 * Docs: https://serpapi.com/amazon-search-api
 *
 * Longer term we'll switch to Amazon's Creators API once we qualify
 * as an Associate. Replacing this module shouldn't require touching
 * callers — same input shape, same output shape.
 */

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

// SerpAPI returns a lot of fields; we only care about a few. Keep the
// schema permissive (passthrough .optional()) so we don't break when
// they add fields.
const organicResultSchema = z
  .object({
    asin: z.string().optional(),
    title: z.string().optional(),
    thumbnail: z.string().optional(),
    link: z.string().optional(),
    sponsored: z.boolean().optional(),
  })
  .passthrough();

const serpapiResponseSchema = z
  .object({
    organic_results: z.array(organicResultSchema).optional(),
    error: z.string().optional(),
    search_information: z
      .object({ total_results: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AmazonSearchResult = {
  asin: string;
  title: string;
  imageUrl: string | null;
  link: string;
  sponsored: boolean;
};

export class SerpApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

/**
 * Search Amazon for a product, return the top non-sponsored organic
 * result with an ASIN. Falls back to sponsored results if no organic
 * results have ASINs. Returns null if nothing matches.
 *
 * The caller is responsible for validating the ASIN/image URL against
 * amazon.com via verifyAsinExists / verifyImageUrl before saving —
 * products get delisted, discontinued ASINs can linger in search
 * results for weeks.
 */
export async function searchAmazonViaSerpApi(
  query: string
): Promise<AmazonSearchResult | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new SerpApiError("SERPAPI_API_KEY not set in environment");
  }

  const trimmed = query.trim();
  if (!trimmed) throw new SerpApiError("empty query");

  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "amazon");
  url.searchParams.set("k", trimmed.slice(0, 200));
  url.searchParams.set("amazon_domain", "amazon.com");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new SerpApiError(
      `SerpAPI HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SerpApiError("SerpAPI returned non-JSON response");
  }

  const parsed = serpapiResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SerpApiError("Unexpected SerpAPI response shape");
  }

  if (parsed.data.error) {
    throw new SerpApiError(`SerpAPI error: ${parsed.data.error}`);
  }

  const results = parsed.data.organic_results ?? [];

  // Prefer organic (non-sponsored) results. Sponsored placements are
  // often accessories or competitors, not the exact product the user
  // asked for.
  const asinShape = /^[A-Z0-9]{10}$/;
  const withAsin = results.filter(
    (r): r is typeof r & { asin: string } =>
      typeof r.asin === "string" && asinShape.test(r.asin)
  );

  const organic = withAsin.find((r) => !r.sponsored);
  const chosen = organic ?? withAsin[0];
  if (!chosen) return null;

  return {
    asin: chosen.asin,
    title: chosen.title ?? "",
    imageUrl: chosen.thumbnail ?? null,
    link: chosen.link ?? `https://www.amazon.com/dp/${chosen.asin}`,
    sponsored: chosen.sponsored ?? false,
  };
}

/**
 * Build the best Amazon search query from a canonical brand/name/model.
 * Prefers model number when specific and not already in the name (most
 * discriminating query); falls back to brand + name.
 */
export function buildAmazonSearchQuery(params: {
  brand: string;
  name: string;
  model?: string;
}): string {
  const { brand, name, model } = params;
  if (
    model &&
    model.length >= 3 &&
    !name.toLowerCase().includes(model.toLowerCase())
  ) {
    return `${brand} ${model}`.trim();
  }
  return `${brand} ${name}`.trim();
}
