import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Typeahead endpoint for the contributor kit editor.
 * GET /api/gear/search?q=shu&limit=10
 * Matches name/brand/model with ILIKE. Returns active + pending so a
 * contributor sees the item they just suggested while it's being approved.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "10", 10) || 10,
    25
  );

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createSupabaseServerClient();

  // Escape ILIKE wildcards in user input so a stray % doesn't broaden the match.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${safe}%`;

  const { data, error } = await supabase
    .from("gear_items")
    .select("id, name, brand, model, category, status, asin")
    .or(`name.ilike.${like},brand.ilike.${like},model.ilike.${like}`)
    .order("status", { ascending: true }) // 'active' before 'pending' alphabetically — fine
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ results: data ?? [] });
}
