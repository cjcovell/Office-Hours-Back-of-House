import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { KitEditor } from "@/components/kit-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { GearItemRow, KitEntryRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit your kit" };

/**
 * Contributor kit editor.
 *
 * Authorization model:
 *   - Not signed in → redirected to /login.
 *   - Signed in with linked_contributor_id → editor for that contributor.
 *   - Admin without linked contributor → contributor picker.
 *   - Admin with ?as=<slug> → editor for that contributor (admin override).
 *   - Signed in but no linked contributor and not admin → "no profile yet".
 *
 * RLS does the actual enforcement; this page just routes the UI.
 */
export default async function KitEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/kit");

  const { as } = await searchParams;
  const isAdmin = me.appUser.role === "admin";
  const supabase = await createSupabaseServerClient();

  // Resolve target contributor.
  let contributorId: string | null = null;
  if (isAdmin && as) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("slug", as)
      .maybeSingle();
    contributorId = data?.id ?? null;
  } else {
    contributorId = me.appUser.linked_contributor_id;
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

      {!contributorId ? (
        isAdmin ? (
          <AdminContributorPicker />
        ) : (
          <NoContributorLink email={me.email} />
        )
      ) : (
        <EditorBlock contributorId={contributorId} />
      )}
    </div>
  );
}

async function EditorBlock({ contributorId }: { contributorId: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: contributor }, { data: kit }] = await Promise.all([
    supabase
      .from("contributors")
      .select("name, slug")
      .eq("id", contributorId)
      .maybeSingle(),
    supabase
      .from("kit_entries")
      .select("*, gear_items(*)")
      .eq("contributor_id", contributorId)
      .order("display_order", { ascending: true }),
  ]);

  if (!contributor) {
    return (
      <p className="text-sm text-muted-foreground">
        Contributor row not found.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Editing kit for <strong>{contributor.name}</strong> (
        <Link
          href={`/contributors/${contributor.slug}`}
          className="underline"
        >
          view public page
        </Link>
        )
      </p>
      <KitEditor
        contributorId={contributorId}
        initialEntries={
          (kit ?? []) as unknown as Array<
            KitEntryRow & { gear_items: GearItemRow }
          >
        }
      />
    </div>
  );
}

async function AdminContributorPicker() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contributors")
    .select("name, slug, show_role")
    .order("display_order", { ascending: true });

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="font-semibold">Pick a contributor to edit</h2>
        <p className="text-sm text-muted-foreground">
          As an admin, you can edit any contributor&rsquo;s kit. Pass{" "}
          <code className="rounded bg-muted px-1">?as=&lt;slug&gt;</code> to
          jump straight in.
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

function NoContributorLink({ email }: { email: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="font-semibold">No contributor profile linked</h2>
        <p className="text-sm text-muted-foreground">
          Your account ({email}) isn&rsquo;t linked to a contributor profile
          yet. An admin needs to link it. The SQL is:
        </p>
        <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
          {`update public.users
  set linked_contributor_id = (
    select id from public.contributors where slug = '<your-slug>'
  )
  where email = '${email}';`}
        </pre>
      </CardContent>
    </Card>
  );
}
