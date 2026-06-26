import { buildAmazonUrl } from "@/lib/amazon";
import type { GearItemRow } from "@/lib/supabase/types";

/**
 * Small gear image thumbnail used in contributor kit lists.
 *
 * - Shows the gear's image at a compact size inline.
 * - On hover, reveals a larger preview floating above the thumbnail
 *   (pure CSS group-hover — no client JS needed).
 * - Clicking goes straight to the Amazon affiliate page when the item
 *   has an ASIN; otherwise it falls back to the internal gear detail
 *   page so the thumbnail is never a dead end.
 *
 * Renders nothing when the item has no image — the surrounding layout
 * already reads fine without a placeholder box.
 */
export function GearThumbnail({ gear }: { gear: GearItemRow }) {
  if (!gear.image_url) return null;

  const amazonUrl = buildAmazonUrl(gear.asin);
  const href = amazonUrl ?? `/gear/${gear.id}`;
  const isExternal = Boolean(amazonUrl);
  const alt = `${gear.brand} ${gear.name}`;

  return (
    <div className="group relative shrink-0">
      <a
        href={href}
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer sponsored" }
          : {})}
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={
          isExternal ? `View ${alt} on Amazon` : `View ${alt} details`
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gear.image_url}
          alt={alt}
          className="size-14 rounded-md border bg-muted object-cover transition-colors group-hover:border-foreground/30"
        />
      </a>

      {/* Enlarged preview — shown on hover or keyboard focus of the group. */}
      <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 origin-top-left scale-95 opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gear.image_url}
          alt=""
          className="size-48 max-w-none rounded-lg border bg-background object-contain p-2 shadow-xl"
        />
      </div>
    </div>
  );
}
