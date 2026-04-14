import { Card, CardContent } from "@/components/ui/card";
import { AdminPendingRow } from "@/components/admin-pending-row";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GearItemRow } from "@/lib/supabase/types";

export const metadata = { title: "Admin · Pending gear" };

export default async function AdminPendingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: pending, error } = await supabase
    .from("gear_items")
    .select("*, kit_entries(count)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <ErrorState message={`Failed to load pending gear: ${error.message}`} />
    );
  }

  type Row = GearItemRow & { kit_entries: { count: number }[] };
  const rows = (pending ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pending gear queue
        </h1>
        <p className="text-muted-foreground">
          Contributor-suggested gear waiting for an Amazon affiliate link.
          Adding the ASIN flips status to <em>active</em> and every kit that
          references the item instantly goes revenue-generating.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Inbox zero. Nothing pending right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((g) => (
            <AdminPendingRow
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}
