"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced fetch.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
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
    }, 180);
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

  const showCreate =
    q.trim().length >= 2 &&
    !results.some(
      (r) =>
        `${r.brand} ${r.name}`.toLowerCase().trim() ===
        q.toLowerCase().trim()
    );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder='Search the catalog (e.g. "SM7B", "Sony FX3", "ATEM")'
          className="pl-9"
        />
        {isPending ? (
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
                    setQ("");
                    setOpen(false);
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
                  setOpen(false);
                }}
              >
                <Plus className="size-4" />
                Create new gear: <span className="font-semibold">{q}</span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
