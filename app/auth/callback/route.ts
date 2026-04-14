import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase redirects here after the user clicks the
 * link in their email; we exchange the one-time code for a session and
 * forward to ?next= (or /).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Only allow same-origin redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/";

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("missing_code")}`, url.origin)
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
