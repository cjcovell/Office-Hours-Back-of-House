import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Returns a lightweight list of gear items that are missing ASIN and/or
 * image_url. The AdminBulkBackfill client component fetches this, then
 * loops the IDs through lookupGearAmazonAction one at a time.
 *
 * Why a separate endpoint instead of baking the list into the page:
 * backfill is a relatively rare admin action and returning potentially
 * hundreds of IDs on every /admin/gear page load is waste.
 */
export async function GET() {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("gear_items")
    .select("id, brand, name, model, asin, image_url")
    .or("asin.is.null,image_url.is.null")
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    items: (data ?? []).map((g) => ({
      id: g.id,
      brand: g.brand,
      name: g.name,
      model: g.model,
      missingAsin: !g.asin,
      missingImage: !g.image_url,
    })),
  });
}
