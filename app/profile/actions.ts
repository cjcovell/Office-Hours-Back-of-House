"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SocialLinks } from "@/lib/supabase/types";

const SOCIAL_KEYS = [
  "twitter",
  "mastodon",
  "bluesky",
  "instagram",
  "youtube",
  "website",
] as const satisfies readonly (keyof SocialLinks)[];

/**
 * Update a contributor profile. RLS enforces that only the linked user (or
 * an admin) can update — we don't re-check here. Slug, role_types, and
 * display_order are admin-only and intentionally not editable from this UI.
 */
export async function updateContributorProfileAction(formData: FormData) {
  const contributorId = String(formData.get("contributorId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const showRole = String(formData.get("show_role") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const headshotUrlRaw = String(formData.get("headshot_url") ?? "").trim();
  const headshotUrl = headshotUrlRaw ? headshotUrlRaw : null;
  const socialLinksRaw = String(formData.get("social_links") ?? "{}");

  if (!contributorId || !name || !showRole) {
    return { error: "Name and show role are required" };
  }

  let socialLinks: SocialLinks = {};
  try {
    const parsed = JSON.parse(socialLinksRaw) as Record<string, unknown>;
    for (const key of SOCIAL_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        socialLinks[key] = value.trim();
      }
    }
  } catch {
    return { error: "Invalid social links payload" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("contributors")
    .update({
      name,
      show_role: showRole,
      bio,
      headshot_url: headshotUrl,
      social_links: socialLinks,
    })
    .eq("id", contributorId);

  if (error) return { error: error.message };

  // Revalidate the public pages that show this profile.
  const { data: row } = await supabase
    .from("contributors")
    .select("slug")
    .eq("id", contributorId)
    .maybeSingle();

  revalidatePath("/profile");
  revalidatePath("/contributors");
  if (row?.slug) revalidatePath(`/contributors/${row.slug}`);

  return { ok: true as const };
}
