"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { lookupAmazonDetails } from "@/lib/ai/gear-enrich";
import { rateLimit } from "@/lib/rate-limit";
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
 * Re-fetch ASIN + image for a single existing gear item via the AI
 * Amazon lookup. Used for:
 *   1. Single-item retry on the admin gear editor ("Re-fetch from Amazon"
 *      button)
 *   2. Bulk backfill driven client-side from /admin/gear — the
 *      AdminBulkBackfill component loops over gear ids and calls this for
 *      each one.
 *
 * Non-destructive by default: only writes fields when the lookup finds a
 * value AND the current row has that field null. Pass `{ force: true }` to
 * overwrite existing values (used when admin explicitly clicks "Re-fetch"
 * on an item that already has data but wants a fresh lookup).
 */
export async function lookupGearAmazonAction(
  gearId: string,
  opts: { force?: boolean } = {}
) {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    return { error: "Forbidden" as const };
  }

  if (!gearId) return { error: "Missing gearId" as const };

  // Shared rate-limit bucket with the kit-editor quick-add flow. At
  // 30/min this will naturally throttle a bulk backfill to ~2 seconds
  // between calls; the client respects retryAfterSeconds for precision.
  const rl = rateLimit(me.authId, "ai-gear-enrich", {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return {
      error: "Rate limited",
      rateLimited: true as const,
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const client = createSupabaseAdminClient();
  const { data: gear, error: readErr } = await client
    .from("gear_items")
    .select("id, brand, name, model, asin, image_url")
    .eq("id", gearId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!gear) return { error: "Gear not found" };

  let lookup;
  try {
    lookup = await lookupAmazonDetails({
      brand: gear.brand,
      name: gear.name,
      model: gear.model,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Amazon lookup failed",
    };
  }

  // Non-destructive merge: only write when AI found a value and either the
  // existing cell is empty or `force` is set.
  const update: { asin?: string | null; image_url?: string | null } = {};
  if (lookup.asin && (opts.force || !gear.asin)) update.asin = lookup.asin;
  if (lookup.imageUrl && (opts.force || !gear.image_url)) {
    update.image_url = lookup.imageUrl;
  }

  if (Object.keys(update).length === 0) {
    return {
      ok: true as const,
      asin: gear.asin,
      imageUrl: gear.image_url,
      noChange: true as const,
    };
  }

  const { error: writeErr } = await client
    .from("gear_items")
    .update(update)
    .eq("id", gearId);
  if (writeErr) return { error: writeErr.message };

  revalidatePath("/admin/gear");
  revalidatePath(`/admin/gear/${gearId}`);
  revalidatePath("/admin");

  return {
    ok: true as const,
    asin: update.asin ?? gear.asin,
    imageUrl: update.image_url ?? gear.image_url,
    foundAsin: !!lookup.asin,
    foundImage: !!lookup.imageUrl,
  };
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
