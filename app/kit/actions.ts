"use server";

import { revalidatePath } from "next/cache";

import { enrichGearFromQuery } from "@/lib/ai/gear-enrich";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GEAR_CATEGORIES } from "@/lib/categories";

/**
 * Add an existing gear item to a contributor's kit.
 * Returns the new row (joined with gear) so the client can append it to
 * state immediately — revalidatePath alone doesn't refresh Client
 * Component state.
 */
export async function addKitEntryAction(formData: FormData) {
  const contributorId = String(formData.get("contributorId") ?? "");
  const gearItemId = String(formData.get("gearItemId") ?? "");
  const notes = (formData.get("notes") as string | null) || null;

  if (!contributorId || !gearItemId) {
    return { error: "Missing contributorId or gearItemId" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: entry, error } = await supabase
    .from("kit_entries")
    .insert({
      contributor_id: contributorId,
      gear_item_id: gearItemId,
      notes,
    })
    .select("*, gear_items(*)")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/kit");
  revalidatePath("/contributors");
  return { ok: true as const, entry };
}

/**
 * Suggest a new gear item AND add it to the contributor's kit. Used as
 * the fallback path when AI enrichment fails — user fills the form
 * manually. Status defaults to pending; the on_gear_inserted trigger
 * fires an admin notification.
 */
export async function suggestGearAndAddAction(formData: FormData) {
  const contributorId = String(formData.get("contributorId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description =
    (String(formData.get("description") ?? "").trim() || null) as string | null;
  const notes = (formData.get("notes") as string | null) || null;
  const imageUrl =
    (String(formData.get("image_url") ?? "").trim() || null) as string | null;

  if (!contributorId || !name || !brand || !model || !category) {
    return { error: "Name, brand, model, and category are required" };
  }
  if (!(GEAR_CATEGORIES as readonly string[]).includes(category)) {
    return { error: `Unknown category "${category}"` };
  }

  const supabase = await createSupabaseServerClient();

  const { data: gear, error: gearErr } = await supabase
    .from("gear_items")
    .insert({
      name,
      brand,
      model,
      category,
      description,
      status: "pending",
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (gearErr) return { error: gearErr.message };

  const { data: entry, error: kitErr } = await supabase
    .from("kit_entries")
    .insert({
      contributor_id: contributorId,
      gear_item_id: gear.id,
      notes,
    })
    .select("*, gear_items(*)")
    .single();
  if (kitErr) return { error: kitErr.message };

  revalidatePath("/kit");
  revalidatePath("/admin");
  return { ok: true as const, entry };
}

/**
 * The fast path: caller passes just a free-text query ("Sony FX3",
 * "the black Shure dynamic mic", an Amazon product title). We enrich
 * it via AI, insert a pending gear_items row, and add it to the
 * contributor's kit — all server-side in one roundtrip. Returns the
 * new kit entry so the client can append it.
 *
 * On AI failure: returns `{ error, fallbackQuery }` so the client can
 * open the manual form pre-filled with the query.
 */
export async function quickAddGearAction(
  contributorId: string,
  query: string
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const trimmed = query.trim();
  if (!trimmed) return { error: "Empty query" };
  if (trimmed.length > 500) return { error: "Query too long" };

  // Tighter limit than feedback but enough headroom for power users.
  const rl = rateLimit(user.id, "ai-gear-enrich", {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    // Structured so the client queue can reschedule precisely.
    return {
      error: `Rate limited — retry in ${rl.retryAfterSeconds}s`,
      rateLimited: true as const,
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  let enriched;
  try {
    enriched = await enrichGearFromQuery(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI enrichment failed";
    return {
      error: "AI couldn't fill in the details. Add manually.",
      fallbackQuery: trimmed,
      detail: msg,
    };
  }

  const { data: gear, error: gearErr } = await supabase
    .from("gear_items")
    .insert({
      name: enriched.name,
      brand: enriched.brand,
      model: enriched.model,
      category: enriched.category,
      description: enriched.description,
      // AI-discovered ASIN + image are persisted but gear stays 'pending'
      // — admin still reviews/approves before anything goes live.
      asin: enriched.asin ?? null,
      image_url: enriched.imageUrl ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (gearErr) return { error: gearErr.message };

  const { data: entry, error: entryErr } = await supabase
    .from("kit_entries")
    .insert({
      contributor_id: contributorId,
      gear_item_id: gear.id,
    })
    .select("*, gear_items(*)")
    .single();
  if (entryErr) return { error: entryErr.message };

  revalidatePath("/kit");
  revalidatePath("/admin");
  revalidatePath("/contributors");
  return { ok: true as const, entry };
}

/**
 * Remove a kit entry.
 */
export async function removeKitEntryAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kit_entries").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/kit");
  return { ok: true as const };
}
