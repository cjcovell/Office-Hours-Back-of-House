import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AmazonLink } from "@/components/amazon-link";
import { RoleBadgeGroup } from "@/components/role-badge";
import { formatCategory } from "@/lib/categories";
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
  const grouped = groupByCategory(sortedKit);

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
          <div className="space-y-10">
            {grouped.map(({ category, entries }) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatCategory(category)}
                </h3>
                <div className="grid gap-3">
                  {entries.map((entry) => (
                    <KitRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function KitRow({
  entry,
}: {
  entry: KitEntryRow & { gear_items: GearItemRow };
}) {
  const gear = entry.gear_items;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {gear.brand}
            </span>
            {gear.status === "pending" ? (
              <Badge variant="muted">Pending</Badge>
            ) : null}
          </div>
          <Link
            href={`/gear/${gear.id}`}
            className="font-semibold hover:underline"
          >
            {gear.name}
          </Link>
          <div className="text-xs text-muted-foreground">{gear.model}</div>
          {entry.notes ? (
            <p className="mt-2 max-w-prose text-sm text-foreground/90">
              &ldquo;{entry.notes}&rdquo;
            </p>
          ) : null}
        </div>
        <div className="shrink-0">
          <AmazonLink asin={gear.asin} />
        </div>
      </CardContent>
    </Card>
  );
}

function groupByCategory(
  entries: Array<KitEntryRow & { gear_items: GearItemRow }>
) {
  const map = new Map<
    string,
    Array<KitEntryRow & { gear_items: GearItemRow }>
  >();
  for (const entry of entries) {
    const cat = entry.category_override ?? entry.gear_items.category;
    const list = map.get(cat) ?? [];
    list.push(entry);
    map.set(cat, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => ({ category, entries }));
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
