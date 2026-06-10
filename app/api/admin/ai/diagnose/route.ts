import { verifyImageUrl } from "@/lib/amazon-verify";
import {
  SerpApiError,
  buildAmazonSearchQuery,
  searchAmazonViaSerpApi,
} from "@/lib/serpapi";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Admin-only diagnostic for the SerpAPI → Amazon verify pipeline.
 *
 * Runs a single lookup against a fixed test query ("Sony FX3") or an
 * admin-supplied one, and returns the full trace:
 *   - SerpAPI raw result (asin / image / title / sponsored flag)
 *   - Verification results against amazon.com for both ASIN and image
 *   - Timing
 *   - Plain-English verdict
 *
 * Use this to sanity-check that SERPAPI_API_KEY is set, that SerpAPI
 * is returning results for a known-good query, and that the verifier
 * is happy with what SerpAPI gives us.
 *
 * Example: /api/admin/ai/diagnose?q=Sony+FX3
 */
export async function GET(request: Request) {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "Sony FX3";
  const query = rawQuery.slice(0, 200);
  const searchQuery = buildAmazonSearchQuery({
    brand: query.split(" ")[0] ?? query,
    name: query,
  });

  const start = Date.now();

  let serpResult;
  let serpError: string | null = null;
  let serpErrorStatus: number | null = null;

  try {
    serpResult = await searchAmazonViaSerpApi(searchQuery);
  } catch (err) {
    serpError = err instanceof Error ? err.message : "unknown";
    if (err instanceof SerpApiError && err.status) {
      serpErrorStatus = err.status;
    }
  }

  const durationMs = Date.now() - start;

  if (serpError) {
    return Response.json({
      query: searchQuery,
      durationMs,
      diagnosis: {
        verdict: `SerpAPI failed: ${serpError}. Check SERPAPI_API_KEY is set in Vercel env vars, and that the key hasn't exhausted its credits.`,
      },
      error: serpError,
      errorStatus: serpErrorStatus,
    });
  }

  if (!serpResult) {
    return Response.json({
      query: searchQuery,
      durationMs,
      diagnosis: {
        verdict:
          "SerpAPI succeeded but returned no results with an ASIN. The query might be too vague or the product isn't on Amazon.",
      },
      serpResult: null,
    });
  }

  // Mirror the real pipeline: the ASIN is trusted as-is (it came from
  // a live Amazon search); only the image URL gets verified.
  const imageVerdict = serpResult.imageUrl
    ? await verifyImageUrl(serpResult.imageUrl)
    : { ok: true as const };

  return Response.json({
    query: searchQuery,
    durationMs: Date.now() - start,
    diagnosis: {
      verdict: !imageVerdict.ok
        ? `SerpAPI found ASIN ${serpResult.asin}, but the image URL failed verification (${"reason" in imageVerdict ? imageVerdict.reason : "?"}). Image would be cleared, ASIN saved.`
        : `Healthy: SerpAPI found ASIN ${serpResult.asin} (${serpResult.sponsored ? "sponsored" : "organic"})${serpResult.imageUrl ? " with a working image" : ", no image in the result"}.`,
    },
    serpResult,
    verification: {
      image: imageVerdict,
    },
  });
}
