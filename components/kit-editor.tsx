"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
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

export function KitEditor({
  contributorId,
  initialEntries,
}: {
  contributorId: string;
  initialEntries: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Add an existing gear item to the kit instantly — no intermediate form. */
  function handlePick(gear: { id: string; name: string; brand: string }) {
    const toastId = toast.loading(`Adding ${gear.brand} ${gear.name}…`);
    const fd = new FormData();
    fd.set("contributorId", contributorId);
    fd.set("gearItemId", gear.id);
    startTransition(async () => {
      const res = await addKitEntryAction(fd);
      if ("error" in res && res.error) {
        toast.error(res.error, { id: toastId });
        return;
      }
      toast.success(`Added ${gear.brand} ${gear.name}`, { id: toastId });
      setEntries((cur) => [...cur, res.entry as unknown as Entry]);
    });
  }

  /** Fast path: AI enriches the query and creates + adds in one go. */
  function handleQuickCreate(query: string) {
    const toastId = toast.loading(`Adding "${query}"…`);
    startTransition(async () => {
      const res = await quickAddGearAction(contributorId, query);
      if ("error" in res && res.error) {
        // AI failure → fall back to the manual form.
        if ("fallbackQuery" in res && res.fallbackQuery) {
          toast.error(res.error, { id: toastId });
          setCreateDraft({
            name: res.fallbackQuery,
            brand: "",
            model: "",
            category: "microphone",
            description: "",
            image_url: null,
          });
          return;
        }
        toast.error(res.error, { id: toastId });
        return;
      }
      const entry = res.entry as unknown as Entry;
      toast.success(
        `Added ${entry.gear_items.brand} ${entry.gear_items.name}`,
        { id: toastId }
      );
      setEntries((cur) => [...cur, entry]);
    });
  }

  /** Manual-form fallback path. Same shape as the quick path, just with
   *  user-filled fields instead of AI-generated ones. */
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
    startTransition(async () => {
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
    });
  }

  function handleRemove(entry: Entry) {
    const fd = new FormData();
    fd.set("id", entry.id);
    startTransition(async () => {
      const res = await removeKitEntryAction(fd);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Add gear</h2>
          {isPending ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Working…
            </span>
          ) : null}
        </div>

        {createDraft ? (
          <CreateGearForm
            draft={createDraft}
            setDraft={setCreateDraft}
            onCancel={() => setCreateDraft(null)}
            onSubmit={handleSuggestNew}
            disabled={isPending}
          />
        ) : (
          <>
            <GearTypeahead
              onPick={handlePick}
              onCreateNew={handleQuickCreate}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline size-3" />
              Pick an existing item or hit &ldquo;Quick add&rdquo; and AI
              fills the details. Keep typing to add more.
            </p>
          </>
        )}
      </section>

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
                    disabled={isPending}
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

function CreateGearForm({
  draft,
  setDraft,
  onCancel,
  onSubmit,
  disabled,
}: {
  draft: CreateDraft;
  setDraft: (d: CreateDraft) => void;
  onCancel: () => void;
  onSubmit: (notes: string) => void;
  disabled: boolean;
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
          <Button
            type="button"
            onClick={() => onSubmit(notes)}
            disabled={disabled}
          >
            Suggest gear &amp; add to kit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={disabled}
          >
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
