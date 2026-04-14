"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { UserRole } from "@/lib/supabase/types";

/**
 * Update a user's role and/or linked contributor. Mounted directly on
 * `<form action>`, so errors surface via redirect to
 * /admin/users?error=...
 */
export async function updateUserAction(formData: FormData) {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    redirect("/admin/users?error=Forbidden");
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  const rawLink = String(formData.get("linkedContributorId") ?? "");
  const linkedContributorId = rawLink === "" ? null : rawLink;

  const bail = (msg: string) =>
    redirect(`/admin/users?error=${encodeURIComponent(msg)}`);

  if (!userId) bail("Missing userId");
  if (role !== "contributor" && role !== "admin") bail("Invalid role");

  const client = createSupabaseAdminClient();

  // Guard: don't let an admin demote their own last-admin self.
  if (userId === me.authId && role !== "admin") {
    const { count } = await client
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      bail("Can't demote yourself — you're the only admin left");
    }
  }

  const { error } = await client
    .from("users")
    .update({ role, linked_contributor_id: linkedContributorId })
    .eq("id", userId);

  if (error) bail(error.message);

  revalidatePath("/admin/users");
}
