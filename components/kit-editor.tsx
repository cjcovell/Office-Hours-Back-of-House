"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GearTypeahead } from "@/components/gear-typeahead";
import {
  addKitEntryAction,
  removeKitEntryAction,
  suggestGearAndAddAction,
} from "@/app/kit/actions";
import { GEAR_CATEGORIES, formatCategory } from "@/lib/categories";
import type { GearItemRow, KitEntryRow } from "@/lib/supabase/types";

type Entry = KitEntryRow & { gear_items: GearItemRow };

export function KitEditor({
  contributorId,
  initialEntries,
}: {
  contributorId: string;
  initialEntries: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [pickedGear, setPickedGear] = useState<{
    id: string;
    name: string;
    brand: string;
    model: string;
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    name: string;
    brand: string;
    model: string;
    category: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddPicked(notes: string) {
    if (!pickedGear) return;
    const fd = new FormData();
    fd.set("contributorId", contributorId);
    fd.set("gearItemId", pickedGear.id);
    if (notes) fd.set("notes", notes);
    startTransition(async () => {
      const res = await addKitEntryAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setPickedGear(null);
    });
  }

  function handleSuggestNew(notes: string) {
    if (!createDraft) return;
    const fd = new FormData();
    fd.set("contributorId", contributorId);
    fd.set("name", createDraft.name);
    fd.set("brand", createDraft.brand);
    fd.set("model", createDraft.model);
    fd.set("category", createDraft.category);
    if (notes) fd.set("notes", notes);
    startTransition(async () => {
      const res = await suggestGearAndAddAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setCreateDraft(null);
    });
  }

  function handleRemove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await removeKitEntryAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setEntries((cur) => cur.filter((e) => e.id !== id));
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Add gear</h2>

        {pickedGear ? (
          <PickedGearForm
            gear={pickedGear}
            onCancel={() => setPickedGear(null)}
            onSubmit={handleAddPicked}
            disabled={isPending}
          />
        ) : createDraft ? (
          <CreateGearForm
            draft={createDraft}
            setDraft={setCreateDraft}
            onCancel={() => setCreateDraft(null)}
            onSubmit={handleSuggestNew}
            disabled={isPending}
          />
        ) : (
          <GearTypeahead
            onPick={(gear) =>
              setPickedGear({
                id: gear.id,
                name: gear.name,
                brand: gear.brand,
                model: gear.model,
              })
            }
            onCreateNew={(query) =>
              setCreateDraft({
                name: query,
                brand: "",
                model: "",
                category: "microphone",
              })
            }
          />
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
                    onClick={() => handleRemove(e.id)}
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

function PickedGearForm({
  gear,
  onCancel,
  onSubmit,
  disabled,
}: {
  gear: { id: string; name: string; brand: string; model: string };
  onCancel: () => void;
  onSubmit: (notes: string) => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {gear.brand}
          </div>
          <div className="font-semibold">{gear.name}</div>
          <div className="text-xs text-muted-foreground">{gear.model}</div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Personal notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I use this as my key light."
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onSubmit(notes)}
            disabled={disabled}
          >
            Add to kit
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

function CreateGearForm({
  draft,
  setDraft,
  onCancel,
  onSubmit,
  disabled,
}: {
  draft: { name: string; brand: string; model: string; category: string };
  setDraft: (d: typeof draft) => void;
  onCancel: () => void;
  onSubmit: (notes: string) => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          New gear is saved as <Badge variant="muted">Pending</Badge> until an
          admin adds the affiliate link.
        </p>
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
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
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
