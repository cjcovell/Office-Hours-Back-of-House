import { z } from "zod";

import { enrichGearFromQuery } from "@/lib/ai/gear-enrich";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  query: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AI calls cost real money; keep the per-user cap tighter than feedback.
  const rl = rateLimit(user.id, "ai-gear-enrich", {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many AI requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid query" },
      { status: 400 }
    );
  }

  try {
    const result = await enrichGearFromQuery(parsed.data.query);
    return Response.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI call failed";
    console.error("[ai/gear-enrich] error:", msg);
    // Don't leak provider details to the client.
    const clientMsg = msg.includes("api key") || msg.includes("API key")
      ? "AI service not configured. Missing AI_GATEWAY_API_KEY."
      : "Couldn't generate gear details. Try rephrasing your query.";
    return Response.json({ error: clientMsg }, { status: 500 });
  }
}
