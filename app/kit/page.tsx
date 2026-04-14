import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { KitEditor } from "@/components/kit-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { GearItemRow, KitEntryRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit your kit" };

/**
 * Contributor kit editor — STUB.
 *
 * Auth flow not yet implemented. Until magic-link sign-in is wired:
 *   - If you're signed in AND your user.linked_contributor_id is set, you
 *     get the real editor for that contributor.
 *   - Otherwise we accept ?as=<slug> to demo the editor as a seeded
 *     contributor. The server actions will only succeed if the calling
 *     session passes RLS, so this is safe to leave on in dev but should be
 *     removed once auth is real.
 */
export default async function KitEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const me = await getCurrentAppUser();

  let contributorId: string | null = null;
  let demoSlug: string | null = null;

  if (me?.appUser.linked_contributor_id) {
    contributorId = me.appUser.linked_contributor_id;
  } else if (as) {
    demoSlug = as;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Edit your kit
        </h1>
        <p className="text-muted-foreground">
          Search the catalog, drop in your gear, add a personal note. Items
          that aren&rsquo;t in the catalog yet get queued for an admin to add
          the affiliate link.
        </p>
      </header>

      {!me ? <AuthStubBanner demoSlug={as ?? null} /> : null}

      {contributorId || demoSlug ? (
        <EditorBlock contributorId={contributorId} demoSlug={demoSlug} />
      ) : (
        <DemoPicker />
      )}
    </div>
  );
}

async function EditorBlock({
  contributorId,
  demoSlug,
}: {
  contributorId: string | null;
  demoSlug: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  let resolvedId = contributorId;
  if (!resolvedId && demoSlug) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("slug", demoSlug)
      .maybeSingle();
    resolvedId = data?.id ?? null;
  }
  if (!resolvedId) {
    return (
      <p className="text-sm text-muted-foreground">
        No contributor found for slug{" "}
        <code className="rounded bg-muted px-1">{demoSlug}</code>.
      </p>
    );
  }

  const [{ data: contributor }, { data: kit }] = await Promise.all([
    supabase.from("contributors").select("name, slug").eq("id", resolvedId).maybeSingle(),
    supabase
      .from("kit_entries")
      .select("*, gear_items(*)")
      .eq("contributor_id", resolvedId)
      .order("display_order", { ascending: true }),
  ]);

  return (
    <div className="space-y-4">
      {contributor ? (
        <p className="text-sm text-muted-foreground">
          Editing kit for <strong>{contributor.name}</strong> (
          <Link href={`/contributors/${contributor.slug}`} className="underline">
            view public page
          </Link>
          )
        </p>
      ) : null}
      <KitEditor
        contributorId={resolvedId}
        initialEntries={
          (kit ?? []) as unknown as Array<
            KitEntryRow & { gear_items: GearItemRow }
          >
        }
      />
    </div>
  );
}

async function DemoPicker() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contributors")
    .select("name, slug, show_role")
    .order("display_order", { ascending: true });

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="font-semibold">Pick a contributor to demo as</h2>
        <p className="text-sm text-muted-foreground">
          Auth isn&rsquo;t wired yet. Pass{" "}
          <code className="rounded bg-muted px-1">?as=&lt;slug&gt;</code> to
          demo the editor as a seeded contributor.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data ?? []).map((c) => (
            <li key={c.slug}>
              <Link
                href={`/kit?as=${c.slug}`}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.show_role}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AuthStubBanner({ demoSlug }: { demoSlug: string | null }) {
  return (
    <div className="rounded-md border border-dashed border-amber-400/40 bg-amber-50/40 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <strong>Auth stub.</strong> Magic-link sign-in is not wired yet, so
      writes will fail unless you&rsquo;re in dev with RLS disabled or are
      running as a service-role user.{" "}
      {demoSlug ? (
        <>
          You&rsquo;re demoing as{" "}
          <code className="rounded bg-amber-100/60 px-1 dark:bg-amber-500/20">
            {demoSlug}
          </code>
          .
        </>
      ) : null}
    </div>
  );
}
