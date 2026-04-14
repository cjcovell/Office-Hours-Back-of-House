"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveGearAction } from "@/app/admin/actions";
import { buildAmazonUrl } from "@/lib/amazon";
import { formatCategory } from "@/lib/categories";
import type { GearItemRow } from "@/lib/supabase/types";

export function AdminPendingRow({
  gear,
  usedByCount,
}: {
  gear: GearItemRow;
  usedByCount: number;
}) {
  const [asin, setAsin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewUrl = asin.length === 10 ? buildAmazonUrl(asin) : null;

  function handleApprove() {
    setError(null);
    const fd = new FormData();
    fd.set("id", gear.id);
    fd.set("asin", asin);
    startTransition(async () => {
      const res = await approveGearAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {gear.brand}
            </div>
            <div className="font-semibold">{gear.name}</div>
            <div className="text-xs text-muted-foreground">
              {gear.model} · {formatCategory(gear.category)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="muted">Pending</Badge>
            <Badge variant="outline">
              In {usedByCount} {usedByCount === 1 ? "kit" : "kits"}
            </Badge>
          </div>
        </div>

        {gear.description ? (
          <p className="text-sm text-muted-foreground">{gear.description}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor={`asin-${gear.id}`}>Amazon ASIN</Label>
            <Input
              id={`asin-${gear.id}`}
              value={asin}
              onChange={(e) => setAsin(e.target.value.toUpperCase())}
              placeholder="e.g. B0002E4Z8M"
              maxLength={10}
              className="font-mono"
            />
          </div>
          <Button onClick={handleApprove} disabled={isPending || !asin}>
            Approve &amp; activate
          </Button>
        </div>

        {previewUrl ? (
          <p className="break-all text-xs text-muted-foreground">
            URL preview:{" "}
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="text-foreground underline"
            >
              {previewUrl}
            </a>
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
