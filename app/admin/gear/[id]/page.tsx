import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AdminGearEditor } from "@/components/admin-gear-editor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GearItemRow } from "@/lib/supabase/types";

export const metadata = { title: "Admin · Edit gear" };

export default async function AdminGearEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = createSupabaseAdminClient();

  const { data: gear } = await client
    .from("gear_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!gear) notFound();

  // Flag other catalog items sharing this ASIN — same ASIN means the same
  // Amazon product, i.e. a likely accidental duplicate.
  const gearAsin = (gear as GearItemRow).asin;
  // Case-insensitive match (ilike, no wildcards) to mirror the
  // catalog-wide scan, which dedupes on upper(asin). ASINs are stored
  // uppercase today, but matching the scan's semantics keeps the two
  // duplicate surfaces from ever disagreeing.
  const { data: asinTwins } = gearAsin
    ? await client
        .from("gear_items")
        .select("id, brand, name, model")
        .ilike("asin", gearAsin)
        .neq("id", id)
    : { data: [] };
  const duplicates = (asinTwins ?? []) as Pick<
    GearItemRow,
    "id" | "brand" | "name" | "model"
  >[];

  // Show which kits reference this item so the admin knows the blast radius.
  const { data: kits } = await client
    .from("kit_entries")
    .select("contributor_id, contributors(name, slug)")
    .eq("gear_item_id", id);

  type KitRef = {
    contributor_id: string;
    contributors: { name: string; slug: string } | null;
  };
  const kitRefs = (kits ?? []) as unknown as KitRef[];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/gear" className="hover:underline">
            ← All gear
          </Link>
          <Link
            href={`/gear/${gear.id}`}
            className="ml-auto text-xs hover:underline"
          >
            Public page →
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {(gear as GearItemRow).brand} {(gear as GearItemRow).name}
        </h1>
        {kitRefs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Used in{" "}
            <strong>
              {kitRefs.length} {kitRefs.length === 1 ? "kit" : "kits"}
            </strong>
            :
            {kitRefs.map((k) =>
              k.contributors ? (
                <Link
                  key={k.contributor_id}
                  href={`/contributors/${k.contributors.slug}`}
                  className="hover:underline"
                >
                  <Badge variant="outline">{k.contributors.name}</Badge>
                </Link>
              ) : null
            )}
          </div>
        ) : null}
      </header>

      {duplicates.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-50/40 p-3 text-sm dark:bg-amber-500/5">
          <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-4" />
            Duplicate ASIN — also used by{" "}
            {duplicates.length} other{" "}
            {duplicates.length === 1 ? "item" : "items"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ASIN <span className="font-mono">{gearAsin}</span> points at the
            same Amazon product as:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {duplicates.map((d) => (
              <Link key={d.id} href={`/admin/gear/${d.id}`}>
                <Badge variant="outline" className="hover:bg-accent">
                  {d.brand} {d.name}
                  {d.model ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      {d.model}
                    </span>
                  ) : null}
                </Badge>
              </Link>
            ))}
          </ul>
        </div>
      ) : null}

      <AdminGearEditor gear={gear as GearItemRow} />
    </div>
  );
}
