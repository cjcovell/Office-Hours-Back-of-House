"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import { GEAR_CATEGORIES } from "@/lib/categories";
import type { GearStatus } from "@/lib/supabase/types";

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    throw new Error("Forbidden");
  }
  return me;
}

/**
 * Update a gear item's canonical fields. Admin-only; enforced at the
 * app layer because we use the service-role client for the DB write.
 */
export async function updateGearAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description =
    (String(formData.get("description") ?? "").trim() || null) as string | null;
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  const imageUrl = imageUrlRaw ? imageUrlRaw : null;
  const asinRaw = String(formData.get("asin") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "") as GearStatus;

  if (!id || !name || !brand || !model || !category) {
    return { error: "Name, brand, model, and category are required" };
  }
  if (!(GEAR_CATEGORIES as readonly string[]).includes(category)) {
    return { error: `Unknown category "${category}"` };
  }
  if (status !== "active" && status !== "pending") {
    return { error: "Status must be active or pending" };
  }
  if (asinRaw && !/^[A-Z0-9]{10}$/.test(asinRaw)) {
    return { error: "ASIN must be 10 alphanumeric characters (or blank)" };
  }
  if (status === "active" && !asinRaw) {
    return {
      error: "Active gear must have an ASIN. Either add one or set status to pending.",
    };
  }

  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("gear_items")
    .update({
      name,
      brand,
      model,
      category,
      description,
      image_url: imageUrl,
      asin: asinRaw || null,
      status,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/gear");
  revalidatePath(`/admin/gear/${id}`);
  revalidatePath("/gear");
  revalidatePath(`/gear/${id}`);
  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Delete a gear item. Cascades to kit_entries via FK, so any contributor
 * kit that referenced this item loses that entry.
 */
export async function deleteGearAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id" };

  const client = createSupabaseAdminClient();
  const { error } = await client.from("gear_items").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/gear");
  revalidatePath("/gear");
  revalidatePath("/contributors");
  redirect("/admin/gear");
}
