"use client";

import { useState, useTransition } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageBucket = "gear-images" | "headshots";

export function ImageUploader({
  bucket,
  pathPrefix,
  currentUrl,
  onUploaded,
  aspect = "square",
  label = "Upload image",
}: {
  bucket: ImageBucket;
  /** Optional folder prefix (e.g. contributor id for headshots). */
  pathPrefix?: string;
  currentUrl: string | null;
  /** Called with the public URL after a successful upload, or "" on remove. */
  onUploaded: (url: string) => void;
  aspect?: "square" | "landscape";
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires onChange
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File must be an image");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`
      );
      return;
    }
    setError(null);

    const localPreview = URL.createObjectURL(file);
    const previousUrl = previewUrl;
    setPreviewUrl(localPreview);

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
        const filename = `${crypto.randomUUID()}-${safeName}`;
        const path = pathPrefix ? `${pathPrefix}/${filename}` : filename;

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

        if (upErr) {
          setError(upErr.message);
          setPreviewUrl(previousUrl);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(path);

        setPreviewUrl(publicUrl);
        onUploaded(publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPreviewUrl(previousUrl);
      } finally {
        // Don't leak the object URL.
        URL.revokeObjectURL(localPreview);
      }
    });
  }

  function handleClear() {
    setPreviewUrl(null);
    onUploaded("");
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-md border bg-muted",
          aspect === "square" ? "size-32" : "h-32 w-48"
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Preview"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
        {isPending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={isPending}
          type="button"
        >
          <label className="cursor-pointer">
            <Upload className="size-3.5" />
            {label}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleChange}
              disabled={isPending}
            />
          </label>
        </Button>
        {previewUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isPending}
          >
            <X className="size-3.5" />
            Remove
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Max 5MB. JPG, PNG, or WEBP recommended.
      </p>
    </div>
  );
}
