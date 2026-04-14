import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import type { UserRole } from "@/lib/supabase/types";

import { updateUserAction } from "./actions";

export const metadata = { title: "Admin · Users" };

type UserRow = {
  id: string;
  email: string;
  role: UserRole;
  linked_contributor_id: string | null;
  created_at: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: actionError } = await searchParams;
  const me = await getCurrentAppUser();
  const client = createSupabaseAdminClient();

  const [{ data: users, error }, { data: contributors }] = await Promise.all([
    client
      .from("users")
      .select("id, email, role, linked_contributor_id, created_at")
      .order("created_at", { ascending: false }),
    client
      .from("contributors")
      .select("id, name, slug")
      .order("name", { ascending: true }),
  ]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load users: {error.message}
      </div>
    );
  }

  // Hydrate auth users for last_sign_in_at.
  const {
    data: { users: authUsers },
  } = await client.auth.admin.listUsers();
  const lastSignInMap: Record<string, string | null> = Object.fromEntries(
    authUsers.map((u) => [u.id, u.last_sign_in_at ?? null])
  );

  const rows = (users ?? []) as UserRow[];
  const contribList = (contributors ?? []) as {
    id: string;
    name: string;
    slug: string;
  }[];
  const contribNameById = new Map(contribList.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          Every authenticated user. Promote to admin or link to a contributor
          profile here. New contributor profiles still have to be created in
          SQL (intentional — keeps the schema clean).
        </p>
      </header>

      {actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No users yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((u) => (
            <UserRowCard
              key={u.id}
              user={u}
              contributors={contribList}
              contribName={
                u.linked_contributor_id
                  ? contribNameById.get(u.linked_contributor_id) ?? null
                  : null
              }
              lastSignIn={lastSignInMap[u.id] ?? null}
              isSelf={u.id === me?.authId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRowCard({
  user,
  contributors,
  contribName,
  lastSignIn,
  isSelf,
}: {
  user: UserRow;
  contributors: { id: string; name: string; slug: string }[];
  contribName: string | null;
  lastSignIn: string | null;
  isSelf: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <form action={updateUserAction} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">
                {user.email}
                {isSelf ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (you)
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                Joined {formatDate(user.created_at)} · Last sign-in{" "}
                {lastSignIn ? formatDate(lastSignIn) : "never"}
              </div>
            </div>
            {contribName ? (
              <span className="text-xs text-muted-foreground">
                Linked to <strong>{contribName}</strong>
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="space-y-1">
              <span className="text-xs font-medium">Role</span>
              <select
                name="role"
                defaultValue={user.role}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="contributor">Contributor</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium">Linked contributor</span>
              <select
                name="linkedContributorId"
                defaultValue={user.linked_contributor_id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— not linked —</option>
                {contributors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </label>

            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
