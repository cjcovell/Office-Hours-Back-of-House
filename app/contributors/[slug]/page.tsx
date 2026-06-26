import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { KitGrid } from "@/components/kit-grid";
import { RoleBadgeGroup } from "@/components/role-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContributorRow,
  KitEntryRow,
  GearItemRow,
  SocialLinks,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type ContributorPageData = ContributorRow & {
  kit_entries: Array<KitEntryRow & { gear_items: GearItemRow }>;
};

export default async function ContributorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("contributors")
    .select(
      `
        *,
        kit_entries (
          *,
          gear_items ( * )
        )
      `
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const contributor = data as unknown as ContributorPageData;
  const sortedKit = [...contributor.kit_entries].sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <article className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar src={contributor.headshot_url} alt={contributor.name} />
        <div className="space-y-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {contributor.name}
            </h1>
            <p className="text-lg text-muted-foreground">
              {contributor.show_role}
            </p>
          </div>
          <RoleBadgeGroup roles={contributor.role_types} />
          {contributor.bio ? (
            <p className="max-w-2xl text-pretty text-base text-muted-foreground">
              {contributor.bio}
            </p>
          ) : null}
          <SocialLinkRow links={contributor.social_links} />
        </div>
      </header>

      <Separator />

      <section className="space-y-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Kit</h2>
          <span className="text-sm text-muted-foreground">
            {sortedKit.length} {sortedKit.length === 1 ? "item" : "items"}
          </span>
        </div>

        {sortedKit.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gear added yet.
          </p>
        ) : (
          <KitGrid entries={sortedKit} />
        )}
      </section>
    </article>
  );
}

function Avatar({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className="size-24 shrink-0 rounded-xl border bg-muted object-cover"
      />
    );
  }
  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border bg-muted text-2xl font-medium text-muted-foreground">
      {alt
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")}
    </div>
  );
}

function SocialLinkRow({ links }: { links: SocialLinks }) {
  const entries = Object.entries(links).filter(([, v]) => Boolean(v));
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {entries.map(([key, url]) => (
        <a
          key={key}
          href={url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
        >
          {capitalize(key)}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
