"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  clearAllAiSourcedDataAction,
  lookupGearAmazonAction,
  verifyGearAsinAction,
} from "@/app/admin/gear/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MissingItem = {
  id: string;
  brand: string;
  name: string;
  model: string;
  missingAsin: boolean;
  missingImage: boolean;
};

type WithAsinItem = {
  id: string;
  brand: string;
  name: string;
  model: string;
  asin: string;
};

type ItemStatus =
  | { state: "pending" }
  | { state: "in-flight" }
  | { state: "done"; detail?: string }
  | { state: "skipped"; detail?: string }
  | { state: "failed"; error: string };

type ActivePhase = "idle" | "verify" | "backfill" | "paused" | "done";

/**
 * Admin card offering two bulk operations on the gear catalog:
 *
 * 1. **Verify existing ASINs.** Loops over gear rows with a non-null
 *    ASIN and fetches amazon.com/dp/<ASIN>. Clears asin + image_url on
 *    rows that don't resolve — this cleans up hallucinated ASINs from
 *    early AI runs before HTTP verification was in place.
 *
 * 2. **Backfill missing ASIN/image.** Loops over gear rows with a null
 *    ASIN or image_url and runs the AI Amazon lookup. With verification
 *    now baked into the AI path, only verified ASINs get saved.
 *
 * Typical cleanup flow: run #1 to purge bad data, then run #2 to refill
 * with (this time verified) AI lookups.
 *
 * Both use the same sequential / rate-limit-aware loop. Sequential not
 * concurrent — at 30 AI calls/min concurrency just wastes calls on
 * rate-limit rejections.
 */
export function AdminBulkBackfill() {
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [withAsin, setWithAsin] = useState<WithAsinItem[]>([]);
  const [statusById, setStatusById] = useState<Record<string, ItemStatus>>({});
  const [phase, setPhase] = useState<ActivePhase>("idle");
  const [activeIds, setActiveIds] = useState<string[]>([]); // ids in the current run, in order
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  const loadLists = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/gear/missing-enrichment", {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { missing: MissingItem[]; withAsin: WithAsinItem[] }
        | { error: string };
      if (!res.ok || "error" in json) {
        setLoadError("error" in json ? json.error : "Failed to load");
        return;
      }
      setMissing(json.missing);
      setWithAsin(json.withAsin);
      setLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  /** Runs a processor function over every id in `ids` with rate-limit-aware retry. */
  async function processQueue(
    ids: string[],
    processor: (id: string) => Promise<ItemStatus>
  ) {
    setActiveIds(ids);
    setStatusById((cur) => {
      const next = { ...cur };
      for (const id of ids) next[id] = { state: "pending" };
      return next;
    });

    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      if (cancelledRef.current) break;
      while (pausedRef.current && !cancelledRef.current) {
        await sleep(200);
      }
      if (cancelledRef.current) break;

      setStatusById((cur) => ({ ...cur, [id]: { state: "in-flight" } }));
      const status = await processor(id);
      setStatusById((cur) => ({ ...cur, [id]: status }));

      if (status.state === "done") succeeded++;
      else if (status.state === "failed") failed++;
    }

    return { succeeded, failed, cancelled: cancelledRef.current };
  }

  async function startVerify() {
    if (withAsin.length === 0) return;
    pausedRef.current = false;
    cancelledRef.current = false;
    setPhase("verify");

    const result = await processQueue(
      withAsin.map((i) => i.id),
      async (id) => {
        // Retry loop for rate-limit responses.
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await verifyGearAsinAction(id);
          if ("rateLimited" in res && res.rateLimited) {
            await sleep((res.retryAfterSeconds ?? 2) * 1000 + 250);
            continue;
          }
          if ("error" in res && res.error) {
            if (attempt < 2) {
              await sleep(1500);
              continue;
            }
            return { state: "failed", error: res.error };
          }
          if ("ok" in res && res.ok) {
            if (res.valid === false) {
              return {
                state: "done",
                detail: `cleared (${res.reason ?? "invalid"})`,
              };
            }
            return { state: "skipped", detail: "valid" };
          }
        }
        return { state: "failed", error: "Too many retries" };
      }
    );

    setPhase(result.cancelled ? "idle" : "done");
    if (!result.cancelled) {
      const clearedMsg =
        result.succeeded > 0
          ? `${result.succeeded} bad ASIN${result.succeeded === 1 ? "" : "s"} cleared`
          : "All ASINs valid";
      toast.success(
        `Verification complete — ${clearedMsg}${
          result.failed > 0 ? ` · ${result.failed} failed` : ""
        }`
      );
      // Refresh lists so the backfill count updates (cleared rows now
      // appear in `missing`).
      await loadLists();
    }
  }

  async function startBackfill() {
    if (missing.length === 0) return;
    pausedRef.current = false;
    cancelledRef.current = false;
    setPhase("backfill");

    const result = await processQueue(
      missing.map((i) => i.id),
      async (id) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await lookupGearAmazonAction(id);
          if ("rateLimited" in res && res.rateLimited) {
            await sleep((res.retryAfterSeconds ?? 2) * 1000 + 250);
            continue;
          }
          if ("error" in res && res.error) {
            if (attempt < 2) {
              await sleep(1500);
              continue;
            }
            return { state: "failed", error: res.error };
          }
          if ("ok" in res && res.ok) {
            const parts: string[] = [];
            if (res.foundAsin) parts.push("ASIN");
            if (res.foundImage) parts.push("image");
            if (parts.length === 0) {
              return { state: "skipped", detail: "no match" };
            }
            return { state: "done", detail: `found ${parts.join(" + ")}` };
          }
        }
        return { state: "failed", error: "Too many retries" };
      }
    );

    setPhase(result.cancelled ? "idle" : "done");
    if (!result.cancelled) {
      toast.success(
        `Backfill complete — ${result.succeeded} updated${
          result.failed > 0 ? `, ${result.failed} failed` : ""
        }`
      );
      await loadLists();
    }
  }

  function pause() {
    pausedRef.current = true;
    setPhase("paused");
  }
  function resume() {
    pausedRef.current = false;
    setPhase(
      activeIds.some((id) => withAsin.find((w) => w.id === id))
        ? "verify"
        : "backfill"
    );
  }
  function cancel() {
    cancelledRef.current = true;
    pausedRef.current = false;
    setPhase("idle");
  }

  const [wipeOpen, setWipeOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
  async function handleWipeAll() {
    setWiping(true);
    const res = await clearAllAiSourcedDataAction("yes-wipe-all");
    setWiping(false);
    setWipeOpen(false);
    if ("error" in res) {
      toast.error(`Wipe failed: ${res.error}`);
      return;
    }
    toast.success(
      `Wiped ${res.clearedAsins} ASIN${res.clearedAsins === 1 ? "" : "s"} and ${res.clearedImages} Amazon image${res.clearedImages === 1 ? "" : "s"}. Admin-uploaded images untouched.`
    );
    await loadLists();
  }

  if (!loaded && !loadError) return null;
  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Failed to load backfill lists: {loadError}
      </div>
    );
  }
  // Show the card whenever there's ANYTHING to do: items to backfill,
  // items to verify, or (if either list has rows) the wipe action.
  const anyWork = missing.length > 0 || withAsin.length > 0;
  if (!anyWork) return null;

  const isRunning = phase === "verify" || phase === "backfill";
  const completed = activeIds.filter((id) => {
    const s = statusById[id];
    return (
      s?.state === "done" || s?.state === "skipped" || s?.state === "failed"
    );
  }).length;
  const inFlight = activeIds.filter(
    (id) => statusById[id]?.state === "in-flight"
  ).length;

  return (
    <Card className="border-amber-500/30 bg-amber-50/20 dark:bg-amber-500/5">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-600" />
            <h3 className="text-sm font-semibold tracking-tight">
              Amazon enrichment tools
            </h3>
          </div>

          {/* Danger zone: wipe all AI-sourced ASINs + Amazon images. */}
          <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                disabled={isRunning || wiping}
              >
                <Trash2 className="size-3.5" />
                Clear all AI data
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all AI-sourced ASINs + images?</DialogTitle>
                <DialogDescription className="space-y-2 pt-2">
                  <span className="block">
                    This wipes <strong>every</strong> ASIN from the catalog
                    and clears image URLs that are hosted on Amazon&rsquo;s
                    CDN.
                  </span>
                  <span className="block">
                    <strong>Admin-uploaded images (Supabase storage) are
                    left alone.</strong>
                  </span>
                  <span className="block text-xs">
                    Use this to reset after the AI populated bad data.
                    After wiping, click <em>Backfill missing</em> to re-run
                    the SerpAPI lookup — that returns real Amazon data, not
                    hallucinations.
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setWipeOpen(false)}
                  disabled={wiping}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={handleWipeAll}
                  disabled={wiping}
                >
                  {wiping ? "Wiping…" : "Yes, wipe all"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Verify existing ASINs */}
          <div className="space-y-2 rounded-md border bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Verify existing ASINs</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Check each saved ASIN against amazon.com. Rows whose ASINs
              don&rsquo;t resolve get their ASIN + image cleared so
              Backfill can retry them.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {withAsin.length}{" "}
                {withAsin.length === 1 ? "item" : "items"} with ASINs
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={startVerify}
                disabled={isRunning || withAsin.length === 0}
              >
                {phase === "verify" ? "Running…" : "Verify"}
              </Button>
            </div>
          </div>

          {/* Backfill missing */}
          <div className="space-y-2 rounded-md border bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Backfill missing</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Run the SerpAPI Amazon lookup for every item missing an
              ASIN or image. Real search results, verified before saving.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {missing.length}{" "}
                {missing.length === 1 ? "item" : "items"} missing
              </span>
              <Button
                size="sm"
                onClick={startBackfill}
                disabled={isRunning || missing.length === 0}
              >
                {phase === "backfill" ? "Running…" : "Backfill"}
              </Button>
            </div>
          </div>
        </div>

        {phase !== "idle" && phase !== "done" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {phase === "paused" ? "Paused · " : ""}
                {completed} / {activeIds.length} processed
                {inFlight > 0 ? ` · ${inFlight} in flight` : ""}
              </span>
              <div className="flex items-center gap-1">
                {phase === "verify" || phase === "backfill" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={pause}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Pause className="size-3" />
                    Pause
                  </Button>
                ) : null}
                {phase === "paused" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resume}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Play className="size-3" />
                    Resume
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancel}
                  className="h-6 gap-1 px-2 text-xs"
                >
                  <X className="size-3" />
                  Cancel
                </Button>
                <span className="tabular-nums">
                  {Math.round((completed / activeIds.length) * 100)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{
                  width: `${(completed / activeIds.length) * 100}%`,
                }}
              />
            </div>
            <details className="pt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show items
              </summary>
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
                {activeIds.map((id) => (
                  <ItemRow
                    key={id}
                    label={labelForId(id, missing, withAsin)}
                    status={statusById[id] ?? { state: "pending" }}
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

function labelForId(
  id: string,
  missing: MissingItem[],
  withAsin: WithAsinItem[]
): { primary: string; secondary?: string } {
  const m = missing.find((i) => i.id === id);
  if (m) {
    return {
      primary: `${m.brand} ${m.name}`,
      secondary: [
        m.missingAsin ? "no ASIN" : null,
        m.missingImage ? "no image" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const w = withAsin.find((i) => i.id === id);
  if (w) return { primary: `${w.brand} ${w.name}`, secondary: w.asin };
  return { primary: id };
}

function ItemRow({
  label,
  status,
}: {
  label: { primary: string; secondary?: string };
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
      <span className="min-w-0 truncate">{label.primary}</span>
      {label.secondary ? (
        <Badge variant="muted" className="font-mono text-[10px]">
          {label.secondary}
        </Badge>
      ) : null}
      <span className="ml-auto shrink-0 text-muted-foreground">
        {statusLabel(status)}
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

function statusLabel(status: ItemStatus) {
  switch (status.state) {
    case "pending":
      return "queued";
    case "in-flight":
      return "working…";
    case "done":
      return status.detail ?? "done";
    case "skipped":
      return status.detail ?? "no change";
    case "failed":
      return <span className="text-destructive">{status.error}</span>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
