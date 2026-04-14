import Link from "next/link";

import { AdminBulkBackfill } from "@/components/admin-bulk-backfill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GEAR_CATEGORIES, formatCategory } from "@/lib/categories";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import type { GearItemRow, GearStatus } from "@/lib/supabase/types";

export const metadata = { title: "Admin · All gear" };

type StatusFilter = GearStatus | "all";

export default async function AdminGearListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const { status, category } = await searchParams;
  const statusFilter: StatusFilter =
    status === "active" || status === "pending" ? status : "all";

  const client = createSupabaseAdminClient();
  let query = client
    .from("gear_items")
    .select("*, kit_entries(count)")
    .order("brand", { ascending: true })
    .order("name", { ascending: true });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load gear: {error.message}
      </div>
    );
  }

  type Row = GearItemRow & { kit_entries: { count: number }[] };
  const rows = (data ?? []) as unknown as Row[];

  const categories = Array.from(
    new Set<string>([...GEAR_CATEGORIES, ...rows.map((g) => g.category)])
  ).sort();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">All gear</h1>
        <p className="text-muted-foreground">
          Every catalog item, active and pending. Click a row to edit
          details, replace the image, update the ASIN, or delete.
        </p>
      </header>

      <AdminBulkBackfill />

      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Status
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip current={statusFilter} value="all" label="All" category={category} />
            <StatusChip current={statusFilter} value="active" label="Active" category={category} />
            <StatusChip current={statusFilter} value="pending" label="Pending" category={category} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Category
          </div>
          <div className="flex flex-wrap gap-2">
            <CategoryChip active={!category} label="All" status={statusFilter} href="/admin/gear" />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                label={formatCategory(c)}
                status={statusFilter}
                href={buildHref(statusFilter, c)}
              />
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No gear matches these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((g) => (
            <GearListRow
              key={g.id}
              gear={g}
              usedByCount={g.kit_entries[0]?.count ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GearListRow({
  gear,
  usedByCount,
}: {
  gear: GearItemRow;
  usedByCount: number;
}) {
  return (
    <Link
      href={`/admin/gear/${gear.id}`}
      className="group block rounded-md border border-border bg-card p-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-3">
        {gear.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gear.image_url}
            alt=""
            className="size-12 shrink-0 rounded-md border bg-muted object-cover"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-md border bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span>{gear.brand}</span>
            <Badge variant="outline">{formatCategory(gear.category)}</Badge>
            {gear.status === "pending" ? (
              <Badge variant="muted">Pending</Badge>
            ) : null}
          </div>
          <div className="truncate font-medium">{gear.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {gear.model}
            {gear.asin ? ` · ASIN ${gear.asin}` : " · no ASIN"}
            {" · "}
            in {usedByCount} {usedByCount === 1 ? "kit" : "kits"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function StatusChip({
  current,
  value,
  label,
  category,
}: {
  current: StatusFilter;
  value: StatusFilter;
  label: string;
  category: string | undefined;
}) {
  return (
    <Link
      href={buildHref(value, category)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        current === value
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

function CategoryChip({
  active,
  label,
  href,
}: {
  active: boolean;
  label: string;
  status: StatusFilter;
  href: string;
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

function buildHref(status: StatusFilter, category: string | undefined) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (category) params.set("category", category);
  const qs = params.toString();
  return qs ? `/admin/gear?${qs}` : "/admin/gear";
}
