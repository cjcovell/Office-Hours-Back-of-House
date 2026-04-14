"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Toggle a feedback row's resolved_at. Mounted directly on `<form action>`,
 * so it must return void. Errors are surfaced via redirect to
 * /admin/feedback?error=...
 */
export async function toggleFeedbackResolvedAction(formData: FormData) {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    redirect("/admin/feedback?error=Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  const resolved = String(formData.get("resolved") ?? "") === "true";
  if (!id) redirect("/admin/feedback?error=Missing+id");

  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("feedback")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) {
    redirect(`/admin/feedback?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/feedback");
}
