import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { getCurrentAppUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/**
 * Auth gate for every admin page. Non-admins see a "promote yourself"
 * snippet; signed-out users get punted to /login.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/admin");

  if (me.appUser.role !== "admin") {
    return <NotAdmin email={me.email} />;
  }

  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}

function NotAdmin({ email }: { email: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin only</h1>
      <p className="text-muted-foreground">
        You&rsquo;re signed in as <strong>{email}</strong> but don&rsquo;t
        have the admin role. Promote yourself in SQL:
      </p>
      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
        {`update public.users set role = 'admin' where email = '${email}';`}
      </pre>
    </div>
  );
}
