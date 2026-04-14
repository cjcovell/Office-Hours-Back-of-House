import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/login/actions";
import { getCurrentAppUser } from "@/lib/supabase/auth";

export async function SiteHeader() {
  const me = await getCurrentAppUser();
  const isAdmin = me?.appUser.role === "admin";
  const hasContributor = !!me?.appUser.linked_contributor_id;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">
            Office Hours
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            Back of House
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/contributors">Contributors</NavLink>
          <NavLink href="/gear">Gear</NavLink>
          {hasContributor || isAdmin ? (
            <NavLink href="/kit">Edit kit</NavLink>
          ) : null}
          {hasContributor || isAdmin ? (
            <NavLink href="/profile">Profile</NavLink>
          ) : null}
          {isAdmin ? <NavLink href="/admin">Admin</NavLink> : null}

          {me ? (
            <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
              <span
                className="max-w-[10rem] truncate text-xs text-muted-foreground"
                title={me.email}
              >
                {me.email}
              </span>
              <form action={signOutAction}>
                <Button variant="ghost" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          ) : (
            <Button asChild variant="outline" size="sm" className="ml-2">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </Link>
  );
}
