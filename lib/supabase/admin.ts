import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Service-role client. Bypasses RLS — only use in server-only code paths
 * where you've done your own authorization check (e.g. confirming the
 * caller is an admin via createSupabaseServerClient first).
 *
 * NEVER import this from a Client Component.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
