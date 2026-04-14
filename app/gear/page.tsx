import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { GearCard } from "@/components/gear-card";
import { GEAR_CATEGORIES, formatCategory } from "@/lib/categories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { GearItemRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gear catalog" };

export default async function GearCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("gear_items")
    .select("*")
    .eq("status", "active")
    .order("brand", { ascending: true })
    .order("name", { ascending: true });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const gear = (data ?? []) as GearItemRow[];

  // Build category list from canonical set + anything new in DB.
  const allCategories = Array.from(
    new Set<string>([...GEAR_CATEGORIES, ...gear.map((g) => g.category)])
  ).sort();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Gear catalog</h1>
        <p className="text-muted-foreground">
          Every product referenced by a contributor kit. One canonical entry per
          piece of gear &mdash; if it appears here, it&rsquo;s used somewhere on
          the show.
        </p>
      </header>

      <CategoryFilter active={category} categories={allCategories} />

      {gear.length === 0 ? (
        <EmptyState category={category} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gear.map((g) => (
            <GearCard key={g.id} gear={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryFilter({
  active,
  categories,
}: {
  active: string | undefined;
  categories: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip href="/gear" active={!active} label="All" />
      {categories.map((c) => (
        <FilterChip
          key={c}
          href={`/gear?category=${encodeURIComponent(c)}`}
          active={active === c}
          label={formatCategory(c)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

function EmptyState({ category }: { category: string | undefined }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No active gear{" "}
        {category ? (
          <>
            in category{" "}
            <Badge variant="outline">{formatCategory(category)}</Badge>
          </>
        ) : (
          "yet"
        )}
        .
      </p>
    </div>
  );
}
