"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/image-uploader";
import { updateContributorProfileAction } from "@/app/profile/actions";
import { cn } from "@/lib/utils";
import type { ContributorRow, SocialLinks } from "@/lib/supabase/types";

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: "twitter", label: "Twitter / X", placeholder: "https://twitter.com/handle" },
  { key: "mastodon", label: "Mastodon", placeholder: "https://mastodon.social/@handle" },
  { key: "bluesky", label: "Bluesky", placeholder: "https://bsky.app/profile/handle" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/handle" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
];

export function ProfileEditor({ contributor }: { contributor: ContributorRow }) {
  const [form, setForm] = useState({
    name: contributor.name,
    show_role: contributor.show_role,
    bio: contributor.bio ?? "",
    headshot_url: contributor.headshot_url ?? "",
    social_links: { ...contributor.social_links } as SocialLinks,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const fd = new FormData();
    fd.set("contributorId", contributor.id);
    fd.set("name", form.name);
    fd.set("show_role", form.show_role);
    fd.set("bio", form.bio);
    fd.set("headshot_url", form.headshot_url);
    fd.set("social_links", JSON.stringify(form.social_links));

    startTransition(async () => {
      const res = await updateContributorProfileAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <Alert tone="destructive">{error}</Alert> : null}
      {success ? <Alert tone="success">Profile saved.</Alert> : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Photo</h2>
          <ImageUploader
            bucket="headshots"
            pathPrefix={contributor.id}
            currentUrl={form.headshot_url || null}
            onUploaded={(url) =>
              setForm((f) => ({ ...f, headshot_url: url }))
            }
            aspect="square"
            label="Upload headshot"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="show_role">Show role</Label>
            <Input
              id="show_role"
              value={form.show_role}
              onChange={(e) =>
                setForm((f) => ({ ...f, show_role: e.target.value }))
              }
              placeholder="e.g. Host, Audio Engineer, Technical Director"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) =>
                setForm((f) => ({ ...f, bio: e.target.value }))
              }
              rows={4}
              placeholder="A few sentences about you and your role on the show."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Links</h2>
          <p className="text-sm text-muted-foreground">All optional.</p>
          {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="url"
                placeholder={placeholder}
                value={form.social_links[key] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    social_links: {
                      ...f.social_links,
                      [key]: e.target.value || undefined,
                    },
                  }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
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
