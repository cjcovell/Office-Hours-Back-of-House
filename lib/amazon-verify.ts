import { searchAmazonViaSerpApi } from "@/lib/serpapi";

/**
 * Amazon data verification helpers.
 *
 * History note: this module used to scrape amazon.com/dp/<ASIN> pages
 * and sniff for 404 markers. That approach is gone — Amazon serves
 * datacenter IPs different HTML than browsers (CAPTCHA/gateway pages),
 * which produced both false positives (hallucinated ASINs passing) and
 * false negatives (real ASINs being discarded). ASIN existence is now
 * checked via SerpAPI search (verifyAsinViaSerpApi); image URLs are
 * still HEAD-checked directly because CDNs don't bot-block.
 */

// Realistic browser UA — some CDNs reject requests with no/odd UAs.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type AsinVerification =
  | { ok: true }
  | { ok: false; reason: string };

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
    // But return a distinct shape so callers can tell "verified ok" apart
    // from "couldn't check."
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[verifyAsinViaSerpApi] SerpAPI error for ${asin}, preserving data: ${msg}`
    );
    return { ok: true, skipped: true, reason: msg } as AsinVerification & {
      skipped: true;
      reason: string;
    };
  }
}

/**
 * Verify that an image URL resolves to a real image. Does a HEAD request
 * and checks status + content-type. If Content-Length is available, also
 * rejects images smaller than 1KB (broken thumbnails / placeholders).
 *
 * The AI lookup often hallucinates image URLs that match Amazon's CDN
 * shape (`m.media-amazon.com/images/I/XXXXXXXX._SL500_.jpg`) but point
 * to nonexistent asset IDs. These return 404, but the browser just
 * shows a broken-image placeholder — the user sees blue question marks
 * everywhere. Verifying before save prevents that.
 *
 * Transient failures (timeout, network error, 5xx, 429) are retried a
 * couple of times before giving up. Without this, a single slow CDN
 * response would discard a perfectly good image URL — that was a real
 * source of backfill inconsistency, where an item got no image on one
 * run but picked one up on the next. Hard failures (404, wrong
 * content-type, too small) are conclusive and returned immediately.
 */
export async function verifyImageUrl(url: string): Promise<AsinVerification> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, reason: `bad protocol: ${parsed.protocol}` };
    }
    if (!isAmazonImageUrl(url)) {
      return { ok: false, reason: `host ${parsed.hostname} is not an Amazon CDN` };
    }
  } catch {
    return { ok: false, reason: "malformed URL" };
  }

  const MAX_ATTEMPTS = 3;
  let lastTransient: AsinVerification = {
    ok: false,
    reason: "image verification failed",
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const [verdict, transient] = await headCheckImage(url);
    if (!transient) return verdict; // conclusive — pass or hard fail
    lastTransient = verdict;
    if (attempt < MAX_ATTEMPTS) {
      // Brief backoff so a momentary CDN hiccup gets a fresh shot.
      await sleep(400 * attempt);
    }
  }

  return lastTransient;
}

/**
 * Single HEAD check. Returns the verdict plus a `transient` flag telling
 * the caller whether the failure is worth retrying (timeout / network /
 * 5xx / 429) versus conclusive (404, wrong content-type, etc.).
 */
async function headCheckImage(
  url: string
): Promise<[AsinVerification, boolean]> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const transient = res.status >= 500 || res.status === 429;
      return [{ ok: false, reason: `HTTP ${res.status}` }, transient];
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return [
        { ok: false, reason: `content-type: ${contentType || "none"}` },
        false,
      ];
    }

    // Tiny responses are almost always transparent pixels or broken-image
    // placeholders. Real product images are >10KB.
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > 0 && contentLength < 1024) {
      return [
        { ok: false, reason: `too small (${contentLength} bytes)` },
        false,
      ];
    }

    return [{ ok: true }, false];
  } catch (err) {
    // Network-level errors (timeout, DNS, connection reset) are transient.
    const reason =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "image verification timed out"
          : err.message
        : "unknown error";
    return [{ ok: false, reason }, true];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Is this URL hosted by Amazon's CDN? Used to decide whether to trust it
 * (uploaded to Supabase by admin) or verify it (suggested by AI, might
 * be hallucinated).
 */
export function isAmazonImageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "m.media-amazon.com" ||
      host.endsWith(".media-amazon.com") ||
      host === "images-na.ssl-images-amazon.com" ||
      host.endsWith(".ssl-images-amazon.com") ||
      host.endsWith(".images-amazon.com")
    );
  } catch {
    return false;
  }
}
