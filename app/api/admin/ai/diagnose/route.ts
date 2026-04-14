import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

import { amazonLookupSchema } from "@/lib/ai/gear-enrich";
import {
  verifyAsinExists,
  verifyImageUrl,
} from "@/lib/amazon-verify";
import { getCurrentAppUser } from "@/lib/supabase/auth";

/**
 * Admin-only diagnostic for the AI Amazon lookup pipeline.
 *
 * Runs one AI call with web_search against a fixed test query ("Sony
 * FX3") or an admin-supplied one, and returns every observable detail:
 *   - Tool calls the model actually made (i.e. did web_search fire?)
 *   - Raw structured output from the model (before verification)
 *   - Verification results against amazon.com for ASIN and image
 *   - Timing
 *
 * Purpose: without this, diagnosing "why is the AI hallucinating" means
 * digging through Vercel function logs. This endpoint turns that into a
 * single GET request the admin can make from a browser.
 *
 * Example: /api/admin/ai/diagnose?q=Sony+FX3
 *
 * If `toolCalls` comes back empty on every query, Gateway is not
 * proxying Anthropic's built-in web_search, and we need to switch to
 * the direct @ai-sdk/anthropic provider (requires ANTHROPIC_API_KEY).
 */
export async function GET(request: Request) {
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "Sony FX3";
  const query = rawQuery.slice(0, 200);

  const MODEL_ID = "anthropic/claude-sonnet-4-5";
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  try {
    result = await generateText({
      model: gateway(MODEL_ID),
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: 3,
          allowedDomains: ["amazon.com"],
        }),
      },
      system:
        "You find Amazon listings. Use web_search to find the product on amazon.com, extract the ASIN from the /dp/ URL, and return the ASIN + product image URL. Return null for fields you cannot confidently verify.",
      prompt: `Find the Amazon listing for: ${query}`,
      experimental_output: Output.object({
        schema: z.object({
          asin: z
            .string()
            .regex(/^[A-Z0-9]{10}$/)
            .nullable(),
          imageUrl: z.string().url().nullable(),
        }),
      }),
    });
  } catch (err) {
    return Response.json(
      {
        query,
        modelId: MODEL_ID,
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }

  const durationMs = Date.now() - start;

  // Walk steps to count tool calls (typed as unknown to avoid pulling
  // in the huge Tool<...> generic from the AI SDK).
  const steps = (result.steps ?? []) as Array<{
    toolCalls?: Array<{ toolName: string; input?: unknown }>;
  }>;
  const toolCalls = steps.flatMap(
    (s) =>
      (s.toolCalls ?? []).map((tc) => ({
        toolName: tc.toolName,
        input: tc.input,
      }))
  );

  const raw = result.experimental_output as z.infer<
    typeof amazonLookupSchema
  >;

  // Verify the AI's output end-to-end, same way the real pipeline does.
  const [asinVerdict, imageVerdict] = await Promise.all([
    raw.asin ? verifyAsinExists(raw.asin) : Promise.resolve({ ok: true }),
    raw.imageUrl
      ? verifyImageUrl(raw.imageUrl)
      : Promise.resolve({ ok: true }),
  ]);

  return Response.json({
    query,
    modelId: MODEL_ID,
    durationMs,
    diagnosis: {
      webSearchCalls: toolCalls.filter((tc) => tc.toolName === "web_search")
        .length,
      totalSteps: steps.length,
      verdict:
        toolCalls.filter((tc) => tc.toolName === "web_search").length === 0
          ? "web_search was NOT invoked — Gateway may not be proxying Anthropic's built-in tool. Consider switching to direct @ai-sdk/anthropic."
          : raw.asin && !asinVerdict.ok
            ? "web_search ran but model hallucinated an ASIN that failed verification."
            : raw.asin && asinVerdict.ok
              ? "web_search ran, model returned a valid ASIN — pipeline is healthy."
              : "web_search ran but model returned null (no confident match).",
    },
    toolCalls,
    rawOutput: raw,
    verification: {
      asin: asinVerdict,
      image: imageVerdict,
    },
  });
}
