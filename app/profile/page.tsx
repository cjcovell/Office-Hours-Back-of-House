import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { ProfileEditor } from "@/components/profile-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { ContributorRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit profile" };

/**
 * Profile editor.
 * - Signed-out → /login
 * - Linked contributor → edit own profile
 * - Admin without link → contributor picker
 * - Admin with ?as=<slug> → edit that contributor's profile
 * - Signed-in but unlinked non-admin → "ask admin to link" message
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/profile");

  const { as } = await searchParams;
  const isAdmin = me.appUser.role === "admin";
  const supabase = await createSupabaseServerClient();

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

  if (!contributorId) {
    if (isAdmin) return <AdminPicker />;
    return <NoContributorLink email={me.email} />;
  }

  const { data: contributor } = await supabase
    .from("contributors")
    .select("*")
    .eq("id", contributorId)
    .maybeSingle();

  if (!contributor) {
    return (
      <p className="text-sm text-muted-foreground">
        Contributor row not found.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Edit profile</h1>
        <p className="text-sm text-muted-foreground">
          Public page:{" "}
          <Link
            href={`/contributors/${contributor.slug}`}
            className="underline"
          >
            /contributors/{contributor.slug}
          </Link>
        </p>
      </header>
      <ProfileEditor contributor={contributor as ContributorRow} />
    </div>
  );
}

async function AdminPicker() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contributors")
    .select("name, slug, show_role")
    .order("display_order", { ascending: true });

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="font-semibold">Pick a contributor profile to edit</h2>
        <p className="text-sm text-muted-foreground">
          As an admin, you can edit any contributor&rsquo;s profile.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data ?? []).map((c) => (
            <li key={c.slug}>
              <Link
                href={`/profile?as=${c.slug}`}
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
