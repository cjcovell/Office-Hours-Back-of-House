"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Send a 6-digit OTP code to the user's email. We deliberately omit
 * `emailRedirectTo` here — that flag is what turns a Supabase OTP into
 * a magic link. Without it, the email contains a typeable code.
 *
 * Why OTP codes instead of magic links: email client prefetch scanners
 * (Gmail, Outlook, corporate filters) eat one-time link tokens before
 * the user clicks. A code typed by hand can't be prefetched.
 */
export async function sendOtpCodeAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");

  if (!email || !EMAIL_RE.test(email)) {
    redirect(
      `/login?error=${encodeURIComponent("Enter a valid email address")}&next=${encodeURIComponent(next)}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`
    );
  }

  redirect(
    `/login?step=verify&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
  );
}

/**
 * Verify the OTP code. On success, the session cookie is set by the
 * @supabase/ssr server client and the user is redirected to `next`.
 */
export async function verifyOtpCodeAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim();
  const next = String(formData.get("next") ?? "/");

  const backToVerify = (msg: string) =>
    redirect(
      `/login?step=verify&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}&error=${encodeURIComponent(msg)}`
    );

  if (!email || !token) backToVerify("Email and code are required");
  if (!/^\d{6}$/.test(token)) backToVerify("Code must be 6 digits");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) backToVerify(error.message);

  const safeNext = next.startsWith("/") ? next : "/";
  redirect(safeNext);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
