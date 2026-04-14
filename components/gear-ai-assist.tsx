"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type GearAiSuggestion = {
  brand: string;
  name: string;
  model: string;
  category: string;
  description: string;
};

/**
 * Compact "auto-fill with AI" affordance. Renders as a small ghost button;
 * clicking expands into a prompt input. On submit, POSTs to
 * /api/ai/gear-enrich and invokes `onFilled` with the structured result.
 */
export function GearAiAssist({
  initialQuery = "",
  onFilled,
  className,
}: {
  /** Optional seed — e.g. the `name` field's current value. */
  initialQuery?: string;
  onFilled: (suggestion: GearAiSuggestion) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!query.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/gear-enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        });
        const data = (await res.json()) as
          | { result: GearAiSuggestion }
          | { error: string };
        if (!res.ok || "error" in data) {
          setError(("error" in data && data.error) || "Failed to generate");
          return;
        }
        onFilled(data.result);
        setExpanded(false);
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
          className
        )}
      >
        <Sparkles className="size-3.5" />
        Auto-fill with AI
      </button>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3",
        className
      )}
    >
      <Label htmlFor="ai-query" className="flex items-center gap-1.5">
        <Sparkles className="size-3.5" />
        Describe the gear
      </Label>
      <Textarea
        id="ai-query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. Sony FX3 full-frame cinema camera · paste an Amazon title · or describe it in your own words"
        rows={2}
        autoFocus
        className="bg-background"
        maxLength={500}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleGenerate}
          disabled={isPending || !query.trim()}
        >
          {isPending ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Generate
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        AI fills brand, name, model, category, and description. Image and
        ASIN stay manual.
      </p>
    </div>
  );
}
