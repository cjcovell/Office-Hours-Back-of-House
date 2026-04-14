"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GearAiAssist } from "@/components/gear-ai-assist";
import { ImageUploader } from "@/components/image-uploader";
import { AmazonLink } from "@/components/amazon-link";
import {
  deleteGearAction,
  lookupGearAmazonAction,
  updateGearAction,
} from "@/app/admin/gear/actions";
import { buildAmazonUrl } from "@/lib/amazon";
import { GEAR_CATEGORIES, formatCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { GearItemRow } from "@/lib/supabase/types";

export function AdminGearEditor({ gear }: { gear: GearItemRow }) {
  const [form, setForm] = useState({
    name: gear.name,
    brand: gear.brand,
    model: gear.model,
    category: gear.category,
    description: gear.description ?? "",
    image_url: gear.image_url ?? "",
    asin: gear.asin ?? "",
    status: gear.status,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isReFetching, startReFetch] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData();
    fd.set("id", gear.id);
    fd.set("name", form.name);
    fd.set("brand", form.brand);
    fd.set("model", form.model);
    fd.set("category", form.category);
    fd.set("description", form.description);
    fd.set("image_url", form.image_url);
    fd.set("asin", form.asin);
    fd.set("status", form.status);
    startTransition(async () => {
      const res = await updateGearAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", gear.id);
    startTransition(async () => {
      await deleteGearAction(fd);
      // action redirects to /admin/gear on success
    });
  }

  /** One-click Amazon re-lookup using the current brand/name/model. */
  function handleReFetch() {
    setError(null);
    setSuccess(false);
    startReFetch(async () => {
      const res = await lookupGearAmazonAction(gear.id, { force: true });
      if ("rateLimited" in res && res.rateLimited) {
        setError(`Rate limited — try again in ${res.retryAfterSeconds}s`);
        return;
      }
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("ok" in res && res.ok) {
        setForm((cur) => ({
          ...cur,
          asin: res.asin ?? "",
          image_url: res.imageUrl ?? "",
        }));
        const bits: string[] = [];
        if (res.foundAsin) bits.push("ASIN");
        if (res.foundImage) bits.push("image");
        setSuccess(true);
        if (bits.length === 0) {
          setError("No confident match on Amazon — leaving fields unchanged.");
          setSuccess(false);
        }
      }
    });
  }

  const previewUrl = form.asin.length === 10 ? buildAmazonUrl(form.asin) : null;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {error ? <Alert tone="destructive">{error}</Alert> : null}
      {success ? <Alert tone="success">Saved.</Alert> : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Image</h2>
          </div>
          <ImageUploader
            bucket="gear-images"
            currentUrl={form.image_url || null}
            onUploaded={(url) =>
              setForm((f) => ({ ...f, image_url: url }))
            }
            aspect="square"
            label={form.image_url ? "Replace image" : "Upload image"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Details</h2>
            <GearAiAssist
              initialQuery={[form.brand, form.name, form.model]
                .filter(Boolean)
                .join(" ")
                .trim()}
              onFilled={(s) =>
                setForm({
                  ...form,
                  brand: s.brand,
                  name: s.name,
                  model: s.model,
                  category: s.category,
                  description: s.description,
                  // Only overwrite ASIN / image if the admin hasn't set them
                  // themselves — don't clobber manually-entered data on
                  // accidental re-runs.
                  asin: form.asin || s.asin || "",
                  image_url: form.image_url || s.imageUrl || "",
                })
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Brand"
              value={form.brand}
              onChange={(v) => setForm({ ...form, brand: v })}
              required
            />
            <Field
              label="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              required
            />
            <Field
              label="Model"
              value={form.model}
              onChange={(v) => setForm({ ...form, model: v })}
              required
            />
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
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
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Affiliate link
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReFetch}
              disabled={isReFetching || isPending}
            >
              <RefreshCw
                className={isReFetching ? "size-3.5 animate-spin" : "size-3.5"}
              />
              {isReFetching ? "Looking up…" : "Re-fetch from Amazon"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="asin">Amazon ASIN</Label>
              <Input
                id="asin"
                value={form.asin}
                onChange={(e) =>
                  setForm({ ...form, asin: e.target.value.toUpperCase() })
                }
                placeholder="B0002E4Z8M"
                maxLength={10}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as "active" | "pending",
                  })
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="pending">Pending (no affiliate link yet)</option>
                <option value="active">Active (public + affiliate link live)</option>
              </select>
            </div>
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
        >
          Delete gear
        </Button>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" type="button">
            <Link href="/admin/gear">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Delete &ldquo;{gear.name}&rdquo;?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will remove the catalog entry and every{" "}
              <code className="rounded bg-muted px-1">kit_entries</code> row
              that references it. Contributor kits that included this item
              will lose that entry. This can&rsquo;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                Delete permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const id = label.toLowerCase();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "destructive" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "destructive"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
      )}
    >
      {children}
    </div>
  );
}

/** Unused here but exported to keep the import tree obvious during review. */
export { AmazonLink };
