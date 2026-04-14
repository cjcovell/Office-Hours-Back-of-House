"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Email + password sign-in. Primary method once an admin has created
 * the user in Supabase dashboard (with Auto Confirm set so no
 * email-verification round-trip is required).
 */
export async function signInWithPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const backToPassword = (msg: string) =>
    redirect(
      `/login?method=password&error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`
    );

  if (!email || !EMAIL_RE.test(email)) backToPassword("Enter a valid email address");
  if (!password) backToPassword("Enter your password");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) backToPassword(error.message);

  const safeNext = next.startsWith("/") ? next : "/";
  redirect(safeNext);
}

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
      `/login?method=code&error=${encodeURIComponent("Enter a valid email address")}&next=${encodeURIComponent(next)}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    redirect(
      `/login?method=code&error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`
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
