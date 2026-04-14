"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Pause, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lookupGearAmazonAction } from "@/app/admin/gear/actions";
import { cn } from "@/lib/utils";

type MissingItem = {
  id: string;
  brand: string;
  name: string;
  model: string;
  missingAsin: boolean;
  missingImage: boolean;
};

type ItemStatus =
  | { state: "pending" }
  | { state: "in-flight" }
  | { state: "done"; foundAsin: boolean; foundImage: boolean }
  | { state: "skipped" }
  | { state: "failed"; error: string };

/**
 * Bulk backfill for gear items missing ASIN and/or image_url. Fetches the
 * list from /api/admin/gear/missing-enrichment, then loops each through
 * lookupGearAmazonAction with rate-limit-aware pacing.
 *
 * Sequential (no concurrency) on purpose — the server rate-limiter is
 * 30/min, concurrency would just spend calls on rejections. Sequential
 * with precise retry timing burns through items at ~0.5/sec steady state.
 *
 * The user can pause/resume and cancel. Progress is shown inline; each
 * item row shows its status.
 */
export function AdminBulkBackfill() {
  const [items, setItems] = useState<MissingItem[]>([]);
  const [statusById, setStatusById] = useState<Record<string, ItemStatus>>({});
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">(
    "idle"
  );
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Use a ref for the pause flag so the running loop can check it without
  // re-triggering effects on every toggle.
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  const loadList = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/gear/missing-enrichment", {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { items: MissingItem[] }
        | { error: string };
      if (!res.ok || "error" in json) {
        setLoadError("error" in json ? json.error : "Failed to load");
        return;
      }
      setItems(json.items);
      setStatusById(
        Object.fromEntries(json.items.map((i) => [i.id, { state: "pending" }]))
      );
      setHasLoadedList(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function start() {
    if (phase === "running") return;
    if (items.length === 0) return;

    pausedRef.current = false;
    cancelledRef.current = false;
    setPhase("running");

    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      if (cancelledRef.current) break;

      // Pause: spin until un-paused or cancelled.
      while (pausedRef.current && !cancelledRef.current) {
        await sleep(200);
      }
      if (cancelledRef.current) break;

      setStatusById((cur) => ({ ...cur, [item.id]: { state: "in-flight" } }));

      // Retry loop for rate-limit responses. Other errors fail the item
      // and we move on.
      let attempts = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempts++;
        const res = await lookupGearAmazonAction(item.id);

        if ("rateLimited" in res && res.rateLimited) {
          const waitMs =
            Math.max(1, res.retryAfterSeconds ?? 2) * 1000 + 250; // small cushion
          // Leave status as in-flight so the UI shows it's still working.
          await sleep(waitMs);
          if (cancelledRef.current) break;
          continue;
        }

        if ("error" in res && res.error) {
          // Give transient errors one retry.
          if (attempts < 2) {
            await sleep(1500);
            continue;
          }
          setStatusById((cur) => ({
            ...cur,
            [item.id]: { state: "failed", error: res.error },
          }));
          failed++;
          break;
        }

        if ("ok" in res && res.ok) {
          setStatusById((cur) => ({
            ...cur,
            [item.id]: {
              state:
                !res.foundAsin && !res.foundImage && res.noChange
                  ? "skipped"
                  : "done",
              foundAsin: !!res.foundAsin,
              foundImage: !!res.foundImage,
            },
          }));
          if (res.foundAsin || res.foundImage) succeeded++;
          break;
        }

        // Unknown shape — fail safe.
        setStatusById((cur) => ({
          ...cur,
          [item.id]: { state: "failed", error: "Unknown response" },
        }));
        failed++;
        break;
      }
    }

    setPhase(cancelledRef.current ? "idle" : "done");
    if (!cancelledRef.current) {
      toast.success(
        `Backfill complete — ${succeeded} updated${
          failed > 0 ? `, ${failed} failed` : ""
        }`
      );
    }
  }

  function pause() {
    pausedRef.current = true;
    setPhase("paused");
  }
  function resume() {
    pausedRef.current = false;
    setPhase("running");
  }
  function cancel() {
    cancelledRef.current = true;
    pausedRef.current = false;
    setPhase("idle");
  }

  if (!hasLoadedList && !loadError) {
    return null; // silently wait for initial list
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Failed to load backfill list: {loadError}
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  const completed = Object.values(statusById).filter(
    (s) => s.state === "done" || s.state === "skipped" || s.state === "failed"
  ).length;
  const inFlight = Object.values(statusById).filter(
    (s) => s.state === "in-flight"
  ).length;

  return (
    <Card className="border-amber-500/30 bg-amber-50/20 dark:bg-amber-500/5">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-600" />
              <h3 className="text-sm font-semibold tracking-tight">
                AI backfill available
              </h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong>{items.length}</strong>{" "}
              {items.length === 1 ? "item is" : "items are"} missing an ASIN
              or image. Run the Amazon lookup across all of them — admin
              approval still required before anything goes active.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "idle" || phase === "done" ? (
              <Button size="sm" onClick={start}>
                {phase === "done" ? "Re-run" : "Start backfill"}
              </Button>
            ) : null}
            {phase === "running" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={pause}
                aria-label="Pause backfill"
              >
                <Pause className="size-3.5" />
                Pause
              </Button>
            ) : null}
            {phase === "paused" ? (
              <Button size="sm" onClick={resume}>
                <Play className="size-3.5" />
                Resume
              </Button>
            ) : null}
            {(phase === "running" || phase === "paused") ? (
              <Button size="sm" variant="ghost" onClick={cancel}>
                <X className="size-3.5" />
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        {phase !== "idle" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completed} / {items.length} processed
                {inFlight > 0 ? ` · ${inFlight} in flight` : ""}
              </span>
              <span className="tabular-nums">
                {Math.round((completed / items.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(completed / items.length) * 100}%` }}
              />
            </div>
            <details className="pt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show items
              </summary>
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    status={statusById[item.id] ?? { state: "pending" }}
                  />
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  status,
}: {
  item: MissingItem;
  status: ItemStatus;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1",
        status.state === "in-flight" && "bg-muted/50"
      )}
    >
      <StatusDot status={status} />
      <span className="truncate">
        <span className="text-muted-foreground">{item.brand}</span>{" "}
        {item.name}
      </span>
      <span className="ml-auto shrink-0 text-muted-foreground">
        {statusLabel(status, item)}
      </span>
    </li>
  );
}

function StatusDot({ status }: { status: ItemStatus }) {
  switch (status.state) {
    case "in-flight":
      return <Loader2 className="size-3 shrink-0 animate-spin" />;
    case "done":
      return <CheckCircle2 className="size-3 shrink-0 text-emerald-600" />;
    case "skipped":
      return <CheckCircle2 className="size-3 shrink-0 text-muted-foreground" />;
    case "failed":
      return <X className="size-3 shrink-0 text-destructive" />;
    default:
      return <div className="size-3 shrink-0 rounded-full border" />;
  }
}

function statusLabel(status: ItemStatus, item: MissingItem) {
  switch (status.state) {
    case "pending":
      return (
        <>
          {item.missingAsin ? <Badge variant="muted">no ASIN</Badge> : null}
          {item.missingImage ? " " : ""}
          {item.missingImage ? (
            <Badge variant="muted">no image</Badge>
          ) : null}
        </>
      );
    case "in-flight":
      return "looking up…";
    case "done": {
      const parts: string[] = [];
      if (status.foundAsin) parts.push("ASIN");
      if (status.foundImage) parts.push("image");
      return parts.length ? `found ${parts.join(" + ")}` : "done";
    }
    case "skipped":
      return "no match";
    case "failed":
      return <span className="text-destructive">{status.error}</span>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
