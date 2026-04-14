"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Approve a pending gear item by setting its ASIN and flipping status to
 * 'active'. RLS allows this only for admin users; the trigger
 * `on_gear_status_change` will resolve any open admin notifications.
 */
export async function approveGearAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const asin = String(formData.get("asin") ?? "").trim();

  if (!id || !asin) {
    return { error: "Gear id and ASIN are required" };
  }
  // Amazon ASINs are 10 chars, alphanumeric. Be permissive but reject blatant junk.
  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    return { error: "ASIN should be 10 alphanumeric characters" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("gear_items")
    .update({ asin: asin.toUpperCase(), status: "active" })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/gear");
  revalidatePath(`/gear/${id}`);
  return { ok: true as const };
}

/**
 * Update a gear item's canonical fields (admin can correct contributor-
 * suggested name/brand/model/category/description before approval).
 */
export async function updateGearDetailsAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = (formData.get("description") as string | null) || null;

  if (!id || !name || !brand || !model || !category) {
    return { error: "All identifying fields are required" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("gear_items")
    .update({ name, brand, model, category, description })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true as const };
}
