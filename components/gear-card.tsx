import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AmazonLink } from "@/components/amazon-link";
import { formatCategory } from "@/lib/categories";
import type { GearItemRow } from "@/lib/supabase/types";

export function GearCard({ gear }: { gear: GearItemRow }) {
  return (
    <Card className="flex h-full flex-col transition-all hover:border-foreground/20 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {gear.brand}
            </div>
            <Link
              href={`/gear/${gear.id}`}
              className="block truncate font-semibold leading-tight hover:underline"
            >
              {gear.name}
            </Link>
            <div className="truncate text-xs text-muted-foreground">
              {gear.model}
            </div>
          </div>
          {gear.status === "pending" ? (
            <Badge variant="muted" className="shrink-0">
              Pending
            </Badge>
          ) : null}
        </div>
        {gear.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {gear.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Badge variant="outline">{formatCategory(gear.category)}</Badge>
          <AmazonLink asin={gear.asin} />
        </div>
      </CardContent>
    </Card>
  );
}
