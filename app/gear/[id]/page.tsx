import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AmazonLink } from "@/components/amazon-link";
import { RoleBadgeGroup } from "@/components/role-badge";
import { formatCategory } from "@/lib/categories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContributorRow, GearItemRow, KitEntryRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type GearPageData = GearItemRow & {
  kit_entries: Array<
    KitEntryRow & {
      contributors: Pick<
        ContributorRow,
        "id" | "name" | "slug" | "show_role" | "role_types" | "headshot_url"
      >;
    }
  >;
};

export default async function GearDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("gear_items")
    .select(
      `
        *,
        kit_entries (
          *,
          contributors ( id, name, slug, show_role, role_types, headshot_url )
        )
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const gear = data as unknown as GearPageData;
  const usedBy = gear.kit_entries
    .map((k) => ({ ...k.contributors, notes: k.notes }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {gear.brand}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{gear.name}</h1>
          {gear.status === "pending" ? (
            <Badge variant="muted">Pending affiliate link</Badge>
          ) : null}
        </div>
        <div className="text-base text-muted-foreground">{gear.model}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{formatCategory(gear.category)}</Badge>
          <AmazonLink asin={gear.asin} size="default" />
        </div>
        {gear.description ? (
          <p className="max-w-prose text-pretty text-muted-foreground">
            {gear.description}
          </p>
        ) : null}
      </header>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Also used by{" "}
          <span className="text-muted-foreground">({usedBy.length})</span>
        </h2>
        {usedBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contributor kits reference this item yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {usedBy.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Avatar src={c.headshot_url} alt={c.name} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      href={`/contributors/${c.slug}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="truncate text-sm text-muted-foreground">
                      {c.show_role}
                    </div>
                    <RoleBadgeGroup roles={c.role_types} />
                    {c.notes ? (
                      <p className="line-clamp-2 pt-1 text-sm text-foreground/80">
                        &ldquo;{c.notes}&rdquo;
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
        className="size-12 shrink-0 rounded-full border bg-muted object-cover"
      />
    );
  }
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium text-muted-foreground">
      {alt
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")}
    </div>
  );
}
