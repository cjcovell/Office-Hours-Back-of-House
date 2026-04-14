"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GEAR_CATEGORIES } from "@/lib/categories";

/**
 * Add an existing gear item to a contributor's kit.
 * Returns { ok: true } or { error: string }.
 *
 * NOTE: while auth is stubbed, this trusts the `contributorId` passed from
 * the form. RLS will reject the write unless the calling Supabase session
 * has linked_contributor_id == contributorId (or is admin). When the magic-
 * link sign-in flow is wired, drop the param and read the contributor from
 * the session instead.
 */
export async function addKitEntryAction(formData: FormData) {
  const contributorId = String(formData.get("contributorId") ?? "");
  const gearItemId = String(formData.get("gearItemId") ?? "");
  const notes = (formData.get("notes") as string | null) || null;

  if (!contributorId || !gearItemId) {
    return { error: "Missing contributorId or gearItemId" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kit_entries").insert({
    contributor_id: contributorId,
    gear_item_id: gearItemId,
    notes,
  });

  if (error) return { error: error.message };

  revalidatePath("/kit");
  revalidatePath(`/contributors`);
  return { ok: true as const };
}

/**
 * Suggest a new gear item AND add it to the contributor's kit in one go.
 * The gear is created with status='pending' and no ASIN; a trigger fires
 * an admin notification.
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

  const { error: kitErr } = await supabase.from("kit_entries").insert({
    contributor_id: contributorId,
    gear_item_id: gear.id,
    notes,
  });
  if (kitErr) return { error: kitErr.message };

  revalidatePath("/kit");
  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Remove a kit entry. Same auth caveat as add.
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
