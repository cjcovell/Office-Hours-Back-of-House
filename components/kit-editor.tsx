"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GearAiAssist } from "@/components/gear-ai-assist";
import { GearTypeahead } from "@/components/gear-typeahead";
import { ImageUploader } from "@/components/image-uploader";
import {
  addKitEntryAction,
  quickAddGearAction,
  removeKitEntryAction,
  suggestGearAndAddAction,
} from "@/app/kit/actions";
import { GEAR_CATEGORIES, formatCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { GearItemRow, KitEntryRow } from "@/lib/supabase/types";

type Entry = KitEntryRow & { gear_items: GearItemRow };

type CreateDraft = {
  name: string;
  brand: string;
  model: string;
  category: string;
  description: string;
  image_url: string | null;
};

type QueueItem = {
  clientId: string;
  query: string;
  status: "pending" | "in-flight";
  retryCount: number;
  nextRetryAt?: number;
  /** True when the current pending state is because we're waiting out a
   *  server rate-limit (vs. a transient error we're backing off from). */
  waitingOnRateLimit: boolean;
};

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;

export function KitEditor({
  contributorId,
  initialEntries,
}: {
  contributorId: string;
  initialEntries: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);

  /** Pick an existing catalog item: direct-add, no queue. The server action
   *  is fast (one insert) so there's nothing to queue against. */
  function handlePick(gear: { id: string; name: string; brand: string }) {
    const toastId = toast.loading(`Adding ${gear.brand} ${gear.name}…`);
    (async () => {
      const fd = new FormData();
      fd.set("contributorId", contributorId);
      fd.set("gearItemId", gear.id);
      const res = await addKitEntryAction(fd);
      if ("error" in res && res.error) {
        toast.error(res.error, { id: toastId });
        return;
      }
      toast.success(`Added ${gear.brand} ${gear.name}`, { id: toastId });
      setEntries((cur) => [...cur, res.entry as unknown as Entry]);
    })();
  }

  /** Quick-create: enqueue. Worker effect below will pick it up. */
  function enqueueQuickCreate(query: string) {
    setQueue((cur) => [
      ...cur,
      {
        clientId: crypto.randomUUID(),
        query,
        status: "pending",
        retryCount: 0,
        waitingOnRateLimit: false,
      },
    ]);
  }

  /** Worker: fire up to MAX_CONCURRENT pending items at a time. */
  useEffect(() => {
    const now = Date.now();
    const inFlight = queue.filter((q) => q.status === "in-flight").length;
    const slots = MAX_CONCURRENT - inFlight;

    const ready = queue
      .filter(
        (q) =>
          q.status === "pending" &&
          (!q.nextRetryAt || q.nextRetryAt <= now)
      )
      .slice(0, Math.max(0, slots));

    if (ready.length === 0) {
      // If items are waiting for retry, schedule a re-check at the earliest.
      const waiting = queue
        .filter((q) => q.status === "pending" && q.nextRetryAt && q.nextRetryAt > now)
        .map((q) => q.nextRetryAt!);
      if (waiting.length > 0) {
        const delay = Math.max(100, Math.min(...waiting) - now);
        const t = setTimeout(() => {
          // Touching state re-runs the effect.
          setQueue((cur) => cur.slice());
        }, delay);
        return () => clearTimeout(t);
      }
      return;
    }

    // Mark ready items in-flight.
    const readyIds = new Set(ready.map((r) => r.clientId));
    setQueue((cur) =>
      cur.map((q) =>
        readyIds.has(q.clientId) ? { ...q, status: "in-flight" } : q
      )
    );

    for (const item of ready) {
      void runItem(item);
    }
    // Only re-run when the queue changes. runItem closes over contributorId
    // via the enclosing scope; contributorId is stable for a given session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  async function runItem(item: QueueItem) {
    const res = await quickAddGearAction(contributorId, item.query);

    // Server-side rate limit: requeue with precise retry time, don't count
    // as a retry attempt.
    if ("rateLimited" in res && res.rateLimited) {
      const delay = Math.max(1, res.retryAfterSeconds ?? 2) * 1000;
      setQueue((cur) =>
        cur.map((q) =>
          q.clientId === item.clientId
            ? {
                ...q,
                status: "pending",
                nextRetryAt: Date.now() + delay,
                waitingOnRateLimit: true,
              }
            : q
        )
      );
      return;
    }

    if ("error" in res && res.error) {
      // AI enrichment failed with a fallback: open the manual form
      // pre-filled (only if no draft is already open).
      if ("fallbackQuery" in res && res.fallbackQuery) {
        setQueue((cur) => cur.filter((q) => q.clientId !== item.clientId));
        setCreateDraft((cur) =>
          cur ?? {
            name: res.fallbackQuery,
            brand: "",
            model: "",
            category: "microphone",
            description: "",
            image_url: null,
          }
        );
        toast.error(`AI couldn't handle "${item.query}" — add manually`);
        return;
      }

      // Transient error: retry with exponential backoff.
      if (item.retryCount < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, item.retryCount);
        setQueue((cur) =>
          cur.map((q) =>
            q.clientId === item.clientId
              ? {
                  ...q,
                  status: "pending",
                  retryCount: q.retryCount + 1,
                  nextRetryAt: Date.now() + delay,
                  waitingOnRateLimit: false,
                }
              : q
          )
        );
        return;
      }

      // Exhausted retries.
      setQueue((cur) => cur.filter((q) => q.clientId !== item.clientId));
      toast.error(`"${item.query}": ${res.error}`);
      return;
    }

    // Success.
    const entry = res.entry as unknown as Entry;
    setQueue((cur) => cur.filter((q) => q.clientId !== item.clientId));
    setEntries((cur) => [...cur, entry]);
    toast.success(
      `Added ${entry.gear_items.brand} ${entry.gear_items.name}`
    );
  }

  function handleSuggestNew(notes: string) {
    if (!createDraft) return;
    const fd = new FormData();
    fd.set("contributorId", contributorId);
    fd.set("name", createDraft.name);
    fd.set("brand", createDraft.brand);
    fd.set("model", createDraft.model);
    fd.set("category", createDraft.category);
    if (createDraft.description) fd.set("description", createDraft.description);
    if (createDraft.image_url) fd.set("image_url", createDraft.image_url);
    if (notes) fd.set("notes", notes);
    const toastId = toast.loading("Saving…");
    (async () => {
      const res = await suggestGearAndAddAction(fd);
      if ("error" in res && res.error) {
        toast.error(res.error, { id: toastId });
        return;
      }
      const entry = res.entry as unknown as Entry;
      toast.success(
        `Added ${entry.gear_items.brand} ${entry.gear_items.name}`,
        { id: toastId }
      );
      setEntries((cur) => [...cur, entry]);
      setCreateDraft(null);
    })();
  }

  function handleRemove(entry: Entry) {
    const fd = new FormData();
    fd.set("id", entry.id);
    (async () => {
      const res = await removeKitEntryAction(fd);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    })();
  }

  const inFlight = queue.filter((q) => q.status === "in-flight").length;
  const queued = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Add gear</h2>
          {queue.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {inFlight} adding, {queued} queued
            </span>
          ) : null}
        </div>

        {createDraft ? (
          <CreateGearForm
            draft={createDraft}
            setDraft={setCreateDraft}
            onCancel={() => setCreateDraft(null)}
            onSubmit={handleSuggestNew}
          />
        ) : (
          <>
            <GearTypeahead
              onPick={handlePick}
              onCreateNew={enqueueQuickCreate}
            />
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline size-3" />
              Type a name and hit Enter. Keep going — items process in the
              background.
            </p>
          </>
        )}
      </section>

      {queue.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Processing
          </h3>
          <div className="grid gap-1.5">
            {queue.map((item) => (
              <QueueItemRow key={item.clientId} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Current kit{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({entries.length})
          </span>
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        ) : (
          <div className="grid gap-3">
            {entries.map((e) => (
              <Card key={e.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {e.gear_items.brand}
                      </span>
                      {e.gear_items.status === "pending" ? (
                        <Badge variant="muted">Pending</Badge>
                      ) : null}
                    </div>
                    <div className="font-medium">{e.gear_items.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.gear_items.model} ·{" "}
                      {formatCategory(e.gear_items.category)}
                    </div>
                    {e.notes ? (
                      <p className="mt-1 text-sm text-foreground/80">
                        &ldquo;{e.notes}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemove(e)}
                    aria-label="Remove from kit"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QueueItemRow({ item }: { item: QueueItem }) {
  const isInFlight = item.status === "in-flight";
  let label: string;
  if (isInFlight) {
    label = "adding…";
  } else if (item.waitingOnRateLimit) {
    const retryIn = item.nextRetryAt
      ? Math.max(0, Math.ceil((item.nextRetryAt - Date.now()) / 1000))
      : 0;
    label = retryIn > 0 ? `rate-limited — retry in ${retryIn}s` : "queued";
  } else if (item.retryCount > 0) {
    label = `retrying (${item.retryCount}/${MAX_RETRIES})`;
  } else {
    label = "queued";
  }
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm",
        item.waitingOnRateLimit && "border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/10"
      )}
    >
      {isInFlight ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate font-mono text-xs">{item.query}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function CreateGearForm({
  draft,
  setDraft,
  onCancel,
  onSubmit,
}: {
  draft: CreateDraft;
  setDraft: (d: CreateDraft) => void;
  onCancel: () => void;
  onSubmit: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Manual fallback. New gear is saved as{" "}
            <Badge variant="muted">Pending</Badge> until an admin adds the
            affiliate link.
          </p>
          <GearAiAssist
            initialQuery={[draft.brand, draft.name, draft.model]
              .filter(Boolean)
              .join(" ")
              .trim()}
            onFilled={(s) =>
              setDraft({
                ...draft,
                brand: s.brand,
                name: s.name,
                model: s.model,
                category: s.category,
                description: s.description,
                // If AI found an image, use it; otherwise keep whatever's
                // already attached.
                image_url: draft.image_url || s.imageUrl || null,
              })
            }
          />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Brand"
                value={draft.brand}
                onChange={(v) => setDraft({ ...draft, brand: v })}
              />
              <Field
                label="Name"
                value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })}
              />
              <Field
                label="Model"
                value={draft.model}
                onChange={(v) => setDraft({ ...draft, model: v })}
              />
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {GEAR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {formatCategory(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                rows={2}
                placeholder="What is it, what's it used for?"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Product image (optional)</Label>
            <ImageUploader
              bucket="gear-images"
              currentUrl={draft.image_url}
              onUploaded={(url) =>
                setDraft({ ...draft, image_url: url || null })
              }
              aspect="square"
              label="Add image"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Personal notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => onSubmit(notes)}>
            Suggest gear &amp; add to kit
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
