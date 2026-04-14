import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Returns two lists for the admin bulk-enrichment UI:
 *
 *  - `missing`: gear with null asin or null image_url. Target for the
 *    "Backfill missing" button — runs the AI Amazon lookup.
 *  - `withAsin`: gear with a non-null asin. Target for the "Verify
 *    existing ASINs" button — runs a page fetch against amazon.com and
 *    clears rows whose ASINs don't resolve (cleans up hallucinated
 *    ASINs from early AI runs before we added verification).
 *
 * Both are returned on the same request because the two buttons live
 * together in the admin UI and we want a single round-trip on page
 * load.
 */
export async function GET() {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = createSupabaseAdminClient();

  const [missingRes, withAsinRes] = await Promise.all([
    client
      .from("gear_items")
      .select("id, brand, name, model, asin, image_url")
      .or("asin.is.null,image_url.is.null")
      .order("created_at", { ascending: true }),
    client
      .from("gear_items")
      .select("id, brand, name, model, asin")
      .not("asin", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  if (missingRes.error) {
    return Response.json({ error: missingRes.error.message }, { status: 500 });
  }
  if (withAsinRes.error) {
    return Response.json(
      { error: withAsinRes.error.message },
      { status: 500 }
    );
  }

  return Response.json({
    missing: (missingRes.data ?? []).map((g) => ({
      id: g.id,
      brand: g.brand,
      name: g.name,
      model: g.model,
      missingAsin: !g.asin,
      missingImage: !g.image_url,
    })),
    withAsin: (withAsinRes.data ?? []).map((g) => ({
      id: g.id,
      brand: g.brand,
      name: g.name,
      model: g.model,
      asin: g.asin!,
    })),
  });
}
