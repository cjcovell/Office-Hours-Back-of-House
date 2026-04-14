import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature", "general"]),
  message: z.string().min(1, "Message is required").max(5000),
  page: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 3 per minute per user
  const rl = rateLimit(user.id, "feedback", {
    maxRequests: 3,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many submissions. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { type, message, page } = parsed.data;

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    type,
    message,
    page: page ?? null,
  });

  if (error) {
    console.error("[feedback] insert error:", error);
    return Response.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
