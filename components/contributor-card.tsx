import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { RoleBadgeGroup } from "@/components/role-badge";
import type { ContributorRow } from "@/lib/supabase/types";

export function ContributorCard({
  contributor,
}: {
  contributor: Pick<
    ContributorRow,
    "name" | "slug" | "show_role" | "role_types" | "headshot_url" | "bio"
  >;
}) {
  return (
    <Link href={`/contributors/${contributor.slug}`} className="group block">
      <Card className="h-full transition-all group-hover:border-foreground/20 group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <Avatar
              src={contributor.headshot_url}
              alt={contributor.name}
              fallback={initials(contributor.name)}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold leading-tight">
                {contributor.name}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {contributor.show_role}
              </div>
            </div>
          </div>
          {contributor.bio ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {contributor.bio}
            </p>
          ) : null}
          <div className="mt-auto pt-1">
            <RoleBadgeGroup roles={contributor.role_types} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function Avatar({
  src,
  alt,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  fallback: string;
}) {
  if (src) {
    // Plain <img> rather than next/image so the seed remote URLs Just Work.
    // Swap to next/image once headshots live in Supabase Storage.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className="size-12 shrink-0 rounded-full border bg-muted object-cover"
      />
    );
  }
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium text-muted-foreground">
      {fallback}
    </div>
  );
}
