"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Send a magic link to the supplied email. The link points at
 * /auth/callback?code=...&next=<dest>. We don't reveal whether the email
 * exists in auth.users — supabase.auth.signInWithOtp creates the user on
 * first sign-in, which is what we want for an invite-style flow.
 */
export async function sendMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address")}`);
  }

  const supabase = await createSupabaseServerClient();
  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
