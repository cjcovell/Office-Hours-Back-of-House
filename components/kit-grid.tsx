"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AmazonLink } from "@/components/amazon-link";
import { buildAmazonUrl } from "@/lib/amazon";
import { formatCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { KitEntryWithGear } from "@/lib/supabase/types";

/**
 * Contributor kit rendered as a dense, filterable card grid (replacing
 * the old sparse category list). Supports free-text search plus
 * Amazon-style facets — brand and category — computed from the kit
 * itself. Price is intentionally not a facet: we don't store prices.
 *
 * Client component because the search/filter is interactive; the kit
 * data is small and already loaded by the server page.
 */
export function KitGrid({ entries }: { entries: KitEntryWithGear[] }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");

  const categoryOf = (e: KitEntryWithGear) =>
    e.category_override ?? e.gear_items.category;

  const brands = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.gear_items.brand))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [entries]
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(entries.map(categoryOf))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const g = e.gear_items;
      if (brand && g.brand !== brand) return false;
      if (category && categoryOf(e) !== category) return false;
      if (q) {
        const hay = `${g.brand} ${g.name} ${g.model} ${
          e.notes ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, brand, category]);

  const hasFilters = Boolean(query || brand || category);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search kit…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <FacetSelect
            label="All brands"
            value={brand}
            onChange={setBrand}
            options={brands}
          />
          <FacetSelect
            label="All categories"
            value={category}
            onChange={setCategory}
            options={categories}
            format={formatCategory}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {filtered.length} of {entries.length}{" "}
          {entries.length === 1 ? "item" : "items"}
        </span>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setBrand("");
              setCategory("");
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <X className="size-3" />
            Clear filters
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No gear matches these filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((entry) => (
            <KitCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function FacetSelect({
  label,
  value,
  onChange,
  options,
  format,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  format?: (v: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        value ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {format ? format(o) : o}
        </option>
      ))}
    </select>
  );
}

function KitCard({ entry }: { entry: KitEntryWithGear }) {
  const gear = entry.gear_items;
  const amazonUrl = buildAmazonUrl(gear.asin);
  const category = entry.category_override ?? gear.category;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link
        href={`/gear/${gear.id}`}
        className="block aspect-square bg-muted"
        aria-label={`${gear.brand} ${gear.name}`}
      >
        {gear.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gear.image_url}
            alt={`${gear.brand} ${gear.name}`}
            className="size-full object-contain p-3"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">
            {gear.brand}
          </span>
          {gear.status === "pending" ? (
            <Badge variant="muted" className="shrink-0">
              Pending
            </Badge>
          ) : null}
        </div>

        <Link
          href={`/gear/${gear.id}`}
          className="line-clamp-2 text-sm font-semibold leading-tight hover:underline"
        >
          {gear.name}
        </Link>
        {gear.model ? (
          <div className="truncate text-xs text-muted-foreground">
            {gear.model}
          </div>
        ) : null}

        <Badge variant="outline" className="w-fit">
          {formatCategory(category)}
        </Badge>

        {entry.notes ? (
          <p className="line-clamp-3 text-xs text-foreground/80">
            &ldquo;{entry.notes}&rdquo;
          </p>
        ) : null}

        <div className="mt-auto pt-1">
          <AmazonLink
            asin={gear.asin}
            label={amazonUrl ? "Amazon" : undefined}
          />
        </div>
      </div>
    </div>
  );
}
