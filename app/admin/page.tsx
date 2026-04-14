import { Card, CardContent } from "@/components/ui/card";
import { AdminPendingRow } from "@/components/admin-pending-row";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { GearItemRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Pending gear" };

/**
 * Admin pending-gear queue — STUB.
 * RLS enforces that only users with role='admin' can update gear_items.
 * Until the magic-link sign-in flow is wired, viewing this page works for
 * everyone, but the approve action only succeeds for admins.
 */
export default async function AdminPage() {
  const me = await getCurrentAppUser();
  const supabase = await createSupabaseServerClient();

  // Pending gear with a count of how many kits reference it (so admins know
  // which approvals unlock the most affiliate revenue first).
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
    <div className="space-y-8">
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

      {!me || me.appUser.role !== "admin" ? (
        <AuthStubBanner role={me?.appUser.role ?? "anonymous"} />
      ) : null}

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

function AuthStubBanner({ role }: { role: string }) {
  return (
    <div className="rounded-md border border-dashed border-amber-400/40 bg-amber-50/40 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <strong>Auth stub.</strong> You&rsquo;re currently{" "}
      <code className="rounded bg-amber-100/60 px-1 dark:bg-amber-500/20">
        {role}
      </code>
      . The approve action requires <code>role = &lsquo;admin&rsquo;</code> on
      your <code>public.users</code> row. Promote yourself in SQL with:
      <pre className="mt-2 overflow-x-auto rounded bg-amber-100/40 px-2 py-1 text-xs dark:bg-amber-500/10">
        {`update public.users set role = 'admin' where email = 'you@example.com';`}
      </pre>
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
