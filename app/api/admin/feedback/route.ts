import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Admin-only routes for reading and resolving feedback.
 *
 * Authorization: public.users.role = 'admin' (via getCurrentAppUser),
 * NOT JWT app_metadata. The admin-client (service role) bypasses RLS
 * for the actual DB read/write — we do our own auth check first.
 */

async function requireAdmin() {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") return null;
  return me;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = createSupabaseAdminClient();

  const { data, error } = await client
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((f) => f.user_id)));
  const emailMap: Record<string, string> = {};
  for (const uid of userIds) {
    const { data: userData } = await client.auth.admin.getUserById(uid);
    if (userData?.user?.email) {
      emailMap[uid] = userData.user.email;
    }
  }

  const feedback = rows.map((f) => ({
    id: f.id,
    type: f.type,
    message: f.message,
    page: f.page,
    createdAt: f.created_at,
    resolvedAt: f.resolved_at,
    userEmail: emailMap[f.user_id] || "Unknown",
  }));

  return Response.json({ feedback });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
});

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "id (uuid) and resolved (boolean) required" },
      { status: 400 }
    );
  }

  const { id, resolved } = parsed.data;
  const client = createSupabaseAdminClient();

  const { error } = await client
    .from("feedback")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
