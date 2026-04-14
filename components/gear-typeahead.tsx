"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GearStatus } from "@/lib/supabase/types";

type SearchResult = {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  status: GearStatus;
};

/** Loose match: every whitespace-separated token in `q` appears somewhere
 *  in the result's combined brand + name + model (case-insensitive). Used
 *  to decide whether Enter should pick the top result or quick-add. */
function topResultLooseMatches(q: string, r: SearchResult): boolean {
  const haystack = `${r.brand} ${r.name} ${r.model}`.toLowerCase();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
}

export function GearTypeahead({
  onPick,
  onCreateNew,
}: {
  onPick: (gear: SearchResult) => void;
  onCreateNew: (query: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isFetching, startFetch] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      startFetch(async () => {
        try {
          const res = await fetch(
            `/api/gear/search?q=${encodeURIComponent(q)}`,
            { cache: "no-store" }
          );
          const json = (await res.json()) as { results?: SearchResult[] };
          setResults(json.results ?? []);
        } catch {
          setResults([]);
        }
      });
    }, 120);
    return () => clearTimeout(handle);
  }, [q]);

  // Click-outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function reset() {
    setQ("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    e.preventDefault();

    // If the top result loosely matches the query, pick it.
    if (results.length > 0 && topResultLooseMatches(trimmed, results[0])) {
      onPick(results[0]);
      reset();
      return;
    }
    // Otherwise quick-add.
    onCreateNew(trimmed);
    reset();
  }

  const exactMatch = results.some(
    (r) =>
      `${r.brand} ${r.name}`.toLowerCase().trim() === q.toLowerCase().trim()
  );
  const showCreate = q.trim().length >= 2 && !exactMatch;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder='Type a gear name, then press Enter — e.g. "Sony FX3"'
          className="pl-9"
        />
        {isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && (results.length > 0 || showCreate) ? (
        <div
          className={cn(
            "absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md"
          )}
        >
          <ul className="max-h-80 overflow-y-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r);
                    reset();
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      <span className="text-muted-foreground">{r.brand}</span>{" "}
                      {r.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.model} · {r.category}
                    </div>
                  </div>
                  {r.status === "pending" ? (
                    <Badge variant="muted">Pending</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {showCreate ? (
            <div className="border-t bg-muted/40">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start rounded-none"
                onClick={() => {
                  onCreateNew(q);
                  reset();
                }}
              >
                <Sparkles className="size-4" />
                Quick add: <span className="font-semibold">{q}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  ⏎ Enter
                </span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

