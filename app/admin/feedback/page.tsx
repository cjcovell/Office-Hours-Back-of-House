import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import type { FeedbackType } from "@/lib/supabase/types";

import { toggleFeedbackResolvedAction } from "./actions";

export const metadata = { title: "Admin · Feedback" };

type Filter = "unresolved" | "resolved" | "all";

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error: actionError } = await searchParams;
  const filter: Filter =
    status === "resolved" || status === "all" ? status : "unresolved";

  const client = createSupabaseAdminClient();

  let query = client
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter === "unresolved") query = query.is("resolved_at", null);
  else if (filter === "resolved") query = query.not("resolved_at", "is", null);

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load feedback: {error.message}
      </div>
    );
  }

  // Hydrate auth user emails.
  const {
    data: { users: authUsers },
  } = await client.auth.admin.listUsers();
  const emailMap: Record<string, string> = Object.fromEntries(
    authUsers.map((u) => [u.id, u.email ?? ""])
  );

  const list = rows ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-muted-foreground">
          Everything submitted via the floating feedback button. Mark rows
          resolved once the underlying issue is shipped; the CLAUDE.md
          startup routine queries unresolved rows.
        </p>
      </header>

      {actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <StatusFilter current={filter} />

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} feedback.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((f) => (
            <FeedbackRow
              key={f.id}
              feedback={f}
              email={emailMap[f.user_id] || "Unknown user"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusFilter({ current }: { current: Filter }) {
  const opts: { value: Filter; label: string }[] = [
    { value: "unresolved", label: "Unresolved" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link
          key={o.value}
          href={o.value === "unresolved" ? "/admin/feedback" : `/admin/feedback?status=${o.value}`}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            current === o.value
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function FeedbackRow({
  feedback,
  email,
}: {
  feedback: {
    id: string;
    type: FeedbackType;
    message: string;
    page: string | null;
    created_at: string;
    resolved_at: string | null;
    user_id: string;
  };
  email: string;
}) {
  const isResolved = !!feedback.resolved_at;
  return (
    <Card className={cn(isResolved && "opacity-70")}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={feedback.type} />
            {isResolved ? <Badge variant="secondary">Resolved</Badge> : null}
            <span className="text-xs text-muted-foreground">
              {formatDate(feedback.created_at)}
            </span>
          </div>
          <form action={toggleFeedbackResolvedAction}>
            <input type="hidden" name="id" value={feedback.id} />
            <input
              type="hidden"
              name="resolved"
              value={isResolved ? "false" : "true"}
            />
            <Button size="sm" variant={isResolved ? "outline" : "default"}>
              {isResolved ? "Reopen" : "Mark resolved"}
            </Button>
          </form>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {feedback.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            From <strong>{email}</strong>
          </span>
          {feedback.page ? (
            <span>
              on{" "}
              <Link
                href={feedback.page}
                className="font-mono underline hover:text-foreground"
              >
                {feedback.page}
              </Link>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TypeBadge({ type }: { type: FeedbackType }) {
  const map: Record<FeedbackType, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "muted" }> = {
    bug: { label: "Bug", variant: "destructive" },
    feature: { label: "Feature", variant: "default" },
    general: { label: "General", variant: "muted" },
  };
  const { label, variant } = map[type];
  return <Badge variant={variant}>{label}</Badge>;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
