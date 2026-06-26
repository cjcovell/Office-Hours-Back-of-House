import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildAmazonUrl } from "@/lib/amazon";

export type DuplicateAsinGroup = {
  asin: string;
  items: { id: string; brand: string; name: string; model: string }[];
};

/**
 * Group gear rows by ASIN and surface any ASIN shared by 2+ items. Two
 * catalog entries with the same ASIN point at the same Amazon product,
 * which is almost always an accidental duplicate the admin wants to
 * merge or delete.
 *
 * ASINs are compared case-insensitively (Amazon ASINs are uppercase, but
 * manual entry can vary). Rows without an ASIN are ignored.
 */
export function findDuplicateAsinGroups(
  rows: { id: string; brand: string; name: string; model: string; asin: string | null }[]
): DuplicateAsinGroup[] {
  const byAsin = new Map<string, DuplicateAsinGroup>();
  for (const row of rows) {
    if (!row.asin) continue;
    const key = row.asin.toUpperCase();
    const group = byAsin.get(key) ?? { asin: key, items: [] };
    group.items.push({
      id: row.id,
      brand: row.brand,
      name: row.name,
      model: row.model,
    });
    byAsin.set(key, group);
  }
  return Array.from(byAsin.values())
    .filter((g) => g.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length || a.asin.localeCompare(b.asin));
}

/**
 * Admin banner listing ASINs that appear on more than one gear item.
 * Renders nothing when the catalog is clean.
 */
export function DuplicateAsinScan({ groups }: { groups: DuplicateAsinGroup[] }) {
  if (groups.length === 0) return null;

  const dupeItemCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <Card className="border-amber-500/30 bg-amber-50/20 dark:bg-amber-500/5">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" />
          <h3 className="text-sm font-semibold tracking-tight">
            Potential duplicate ASINs
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {groups.length} ASIN{groups.length === 1 ? "" : "s"} shared by{" "}
          {dupeItemCount} catalog items. Items with the same ASIN point at the
          same Amazon product — review and merge or delete the extras.
        </p>
        <ul className="space-y-3">
          {groups.map((group) => {
            const url = buildAmazonUrl(group.asin);
            return (
              <li key={group.asin} className="rounded-md border bg-background/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="muted" className="font-mono text-[10px]">
                    {group.asin}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length} items
                  </span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      View on Amazon
                    </a>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/admin/gear/${item.id}`}
                        className="text-sm hover:underline"
                      >
                        <span className="font-medium">
                          {item.brand} {item.name}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {item.model}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
