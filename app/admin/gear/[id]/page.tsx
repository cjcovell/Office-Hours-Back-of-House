import Link from "next/link";
import { notFound } from "next/navigation";

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

      <AdminGearEditor gear={gear as GearItemRow} />
    </div>
  );
}
