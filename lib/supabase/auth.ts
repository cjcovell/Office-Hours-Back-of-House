import { createSupabaseServerClient } from "./server";
import type { UserRow } from "./types";

/**
 * Returns the authenticated user's app row (public.users) along with their
 * Supabase auth identity, or null if not signed in.
 */
export async function getCurrentAppUser(): Promise<{
  authId: string;
  email: string;
  appUser: UserRow;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser) return null;
  return { authId: user.id, email: user.email ?? appUser.email, appUser };
}

export async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    throw new Error("Forbidden: admin only");
  }
  return me;
}

export async function requireContributor() {
  const me = await getCurrentAppUser();
  if (!me) throw new Error("Not signed in");
  return me;
}
