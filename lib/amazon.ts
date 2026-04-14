/**
 * Build an Amazon affiliate URL from a stored ASIN + the configured tag.
 * Returns null if either is missing — callers should render a non-clickable
 * placeholder in that case.
 */
export function buildAmazonUrl(asin: string | null | undefined): string | null {
  if (!asin) return null;
  const tag = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG;
  const tld = process.env.NEXT_PUBLIC_AMAZON_TLD || "com";
  const base = `https://www.amazon.${tld}/dp/${encodeURIComponent(asin)}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}
