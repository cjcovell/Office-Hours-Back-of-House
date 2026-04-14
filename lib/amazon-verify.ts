/**
 * Verify that an Amazon ASIN resolves to a real product page.
 *
 * The AI lookup, even with web_search grounded to amazon.com, sometimes
 * hands back 10-char strings that match the ASIN shape but don't exist
 * on Amazon. Symptoms: affiliate links 404 or redirect to the homepage.
 *
 * We don't have PA-API access (requires qualifying as an affiliate), so
 * there's no clean "does this ASIN exist" endpoint. Instead, we fetch
 * the /dp/ page and sniff the response for Amazon's 404 markers. This
 * isn't perfect — Amazon changes copy, may serve different pages by
 * region, and aggressively varies markup — but it reliably catches the
 * common "ASIN doesn't exist" case which is what the model produces
 * when it hallucinates.
 *
 * Usage: only call this after the AI returns an ASIN. It adds ~1s of
 * latency per call; at our rate limits that's well within tolerance.
 */

// Text that shows up on Amazon's 404 / "not a functioning page" responses,
// which often return HTTP 200 (making status-code checks alone insufficient).
//
// These are case-insensitive substrings (we lowercase the HTML before
// matching). Avoid matching on punctuation — Amazon's 404 renders as
// <h1>Sorry</h1><h2>we couldn't find that page</h2> so any string with
// a comma between "Sorry" and "we couldn't" will silently miss.
const BAD_PAGE_INDICATORS = [
  "couldn't find that page", // the headline on Amazon's 404
  "meet the dogs of amazon", // the Easter-egg caption, 404-only
  "try searching or go to",
  "the web address you entered is not a functioning page",
  "we're sorry. the web address you entered",
  "page you requested",
  "this page isn't available",
  "looking for something",
];

const REQUEST_HEADERS = {
  // Realistic browser UA — Amazon returns minimal HTML to obvious bots.
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export type AsinVerification =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyAsinExists(
  asin: string
): Promise<AsinVerification> {
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return { ok: false, reason: "malformed ASIN" };
  }

  try {
    const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
      redirect: "follow",
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    // Final URL after redirects — if Amazon redirected away from /dp/,
    // the ASIN likely didn't exist and they bounced us to a search or
    // home page. (They don't 404 consistently; sometimes they 302.)
    const finalUrl = res.url;
    if (
      !finalUrl.includes("/dp/") &&
      !finalUrl.includes("/gp/product/")
    ) {
      return { ok: false, reason: `redirected to ${finalUrl}` };
    }

    // Only need the first chunk — 404 copy and product markers both
    // appear early in the document.
    const html = (await res.text()).slice(0, 40_000).toLowerCase();

    const badMatch = BAD_PAGE_INDICATORS.find((m) => html.includes(m));
    if (badMatch) {
      return { ok: false, reason: `404 marker: "${badMatch}"` };
    }

    // Positive sanity check: a real product page references the ASIN
    // (canonical link, productID meta tag, buy-box JSON). If the ASIN
    // is nowhere in the doc, the page probably isn't for this product.
    if (!html.includes(asin.toLowerCase())) {
      return { ok: false, reason: "ASIN not found in document" };
    }

    return { ok: true };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "verification timed out"
          : err.message
        : "unknown error";
    return { ok: false, reason };
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
 */
export async function verifyImageUrl(url: string): Promise<AsinVerification> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, reason: `bad protocol: ${parsed.protocol}` };
    }
  } catch {
    return { ok: false, reason: "malformed URL" };
  }

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": REQUEST_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { ok: false, reason: `content-type: ${contentType || "none"}` };
    }

    // Tiny responses are almost always transparent pixels or broken-image
    // placeholders. Real product images are >10KB.
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > 0 && contentLength < 1024) {
      return { ok: false, reason: `too small (${contentLength} bytes)` };
    }

    return { ok: true };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "image verification timed out"
          : err.message
        : "unknown error";
    return { ok: false, reason };
  }
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
