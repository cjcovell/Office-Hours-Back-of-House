import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildAmazonUrl } from "@/lib/amazon";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import type { AiCallLogRow } from "@/lib/supabase/types";

export const metadata = { title: "Admin · Enrichment logs" };

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}

const FN_LABELS: Record<string, string> = {
  enrichGearFromQuery: "Text + Amazon",
  lookupAmazonDetails: "Amazon lookup",
  lookupAmazonByAsin: "ASIN lookup",
  generateGearDescription: "AI description",
};

// Functions offered as filter chips (label comes from FN_LABELS).
const FN_FILTERS = [
  "enrichGearFromQuery",
  "lookupAmazonDetails",
  "lookupAmazonByAsin",
  "generateGearDescription",
] as const;

function fnLabel(fn: string): string {
  return FN_LABELS[fn] ?? fn;
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default async function AdminAiLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ fn?: string; errors?: string }>;
}) {
  // Extra safety check (layout already guards but belt + suspenders).
  const me = await getCurrentAppUser();
  if (!me || me.appUser.role !== "admin") redirect("/login?next=/admin/ai-logs");

  const { fn, errors } = await searchParams;
  const fnFilter = (FN_FILTERS as readonly string[]).includes(fn ?? "")
    ? (fn as string)
    : null;
  const errorsOnly = errors === "1";

  const client = createSupabaseAdminClient();
  let logsQuery = client
    .from("ai_call_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (fnFilter) logsQuery = logsQuery.eq("fn", fnFilter);
  if (errorsOnly) logsQuery = logsQuery.not("error", "is", null);

  const { data: rows, error } = await logsQuery;

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load AI call logs: {error.message}
      </div>
    );
  }

  const logs: AiCallLogRow[] = rows ?? [];

  // Summary stats
  const total = logs.length;
  const successes = logs.filter((r) => r.final_asin !== null).length;
  const successRate =
    total > 0 ? Math.round((successes / total) * 100) : 0;
  const durationsWithValues = logs
    .map((r) => r.duration_ms)
    .filter((d): d is number => d !== null);
  const avgDuration =
    durationsWithValues.length > 0
      ? Math.round(
          durationsWithValues.reduce((a, b) => a + b, 0) /
            durationsWithValues.length
        )
      : null;
  const errorCount = logs.filter((r) => r.error !== null).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Enrichment logs
        </h1>
        <p className="text-muted-foreground">
          Every SerpAPI lookup and AI text-enrichment call, newest first.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={!fnFilter && !errorsOnly}
          label="All"
          href={buildLogsHref(null, false)}
        />
        {FN_FILTERS.map((f) => (
          <FilterChip
            key={f}
            active={fnFilter === f}
            label={fnLabel(f)}
            href={buildLogsHref(f, errorsOnly)}
          />
        ))}
        <FilterChip
          active={errorsOnly}
          label="Errors only"
          href={buildLogsHref(fnFilter, !errorsOnly)}
        />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total calls" value={String(total)} />
        <StatCard label="Success rate" value={`${successRate}%`} />
        <StatCard
          label="Avg duration"
          value={formatDuration(avgDuration)}
        />
        <StatCard
          label="Errors"
          value={String(errorCount)}
          highlight={errorCount > 0}
        />
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {fnFilter || errorsOnly
              ? "No logs match this filter."
              : "No AI call logs yet."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Function</th>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">ASIN</th>
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Final ASIN</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((row) => (
                  <LogTableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="grid gap-3 md:hidden">
            {logs.map((row) => (
              <LogCard key={row.id} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function buildLogsHref(fn: string | null, errorsOnly: boolean): string {
  const p = new URLSearchParams();
  if (fn) p.set("fn", fn);
  if (errorsOnly) p.set("errors", "1");
  const qs = p.toString();
  return qs ? `/admin/ai-logs?${qs}` : "/admin/ai-logs";
}

function FilterChip({
  active,
  label,
  href,
}: {
  active: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            highlight ? "text-destructive" : "text-foreground"
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function AsinCell({ row }: { row: AiCallLogRow }) {
  if (!row.ai_returned_asin) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.asin_verified === true) {
    return (
      <span className="flex items-center gap-1">
        <span className="font-mono text-xs">{row.ai_returned_asin}</span>
        <span className="text-green-600" title="Verified">
          ✓
        </span>
      </span>
    );
  }
  if (row.asin_verified === false) {
    return (
      <span className="flex items-center gap-1">
        <span className="font-mono text-xs">{row.ai_returned_asin}</span>
        <span
          className="text-destructive"
          title={row.asin_fail_reason ?? "Verification failed"}
        >
          ✗
        </span>
      </span>
    );
  }
  // asin_verified is null — not yet checked
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {row.ai_returned_asin}
    </span>
  );
}

function ImageCell({ row }: { row: AiCallLogRow }) {
  if (!row.ai_returned_image) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.image_verified === true) {
    return (
      <span
        className="text-green-600"
        title={row.ai_returned_image}
      >
        ✓
      </span>
    );
  }
  if (row.image_verified === false) {
    return (
      <span
        className="text-destructive"
        title={row.image_fail_reason ?? "Verification failed"}
      >
        ✗
      </span>
    );
  }
  return (
    <span className="text-muted-foreground" title={row.ai_returned_image}>
      ?
    </span>
  );
}

function FinalAsinCell({ row }: { row: AiCallLogRow }) {
  if (!row.final_asin) {
    return <span className="text-muted-foreground">—</span>;
  }
  const url = buildAmazonUrl(row.final_asin);
  if (!url) {
    return <span className="font-mono text-xs">{row.final_asin}</span>;
  }
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs underline hover:text-foreground"
    >
      {row.final_asin}
    </Link>
  );
}

function ErrorCell({ row }: { row: AiCallLogRow }) {
  if (!row.error) return null;
  return (
    <Badge variant="destructive" title={row.error}>
      Error
    </Badge>
  );
}

function LogTableRow({ row }: { row: AiCallLogRow }) {
  return (
    <tr className="text-sm hover:bg-muted/30">
      <td
        className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground"
        title={row.created_at}
      >
        {relativeTime(row.created_at)}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline">{fnLabel(row.fn)}</Badge>
      </td>
      <td
        className="max-w-[200px] px-3 py-2 text-xs"
        title={row.query}
      >
        {truncate(row.query, 50)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
        {formatDuration(row.duration_ms)}
      </td>
      <td className="px-3 py-2">
        <AsinCell row={row} />
      </td>
      <td className="px-3 py-2">
        <ImageCell row={row} />
      </td>
      <td className="px-3 py-2">
        <FinalAsinCell row={row} />
      </td>
      <td className="px-3 py-2">
        <ErrorCell row={row} />
      </td>
    </tr>
  );
}

function LogCard({ row }: { row: AiCallLogRow }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{fnLabel(row.fn)}</Badge>
            {row.error ? (
              <Badge variant="destructive" title={row.error}>
                Error
              </Badge>
            ) : null}
          </div>
          <span
            className="text-xs text-muted-foreground"
            title={row.created_at}
          >
            {relativeTime(row.created_at)}
          </span>
        </div>

        <p className="text-sm" title={row.query}>
          {truncate(row.query, 80)}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Duration: {formatDuration(row.duration_ms)}</span>

          {row.ai_returned_asin ? (
            <span className="flex items-center gap-1">
              ASIN:{" "}
              <span className="font-mono">{row.ai_returned_asin}</span>
              {row.asin_verified === true && (
                <span className="text-green-600" title="Verified">
                  ✓
                </span>
              )}
              {row.asin_verified === false && (
                <span
                  className="text-destructive"
                  title={row.asin_fail_reason ?? "Verification failed"}
                >
                  ✗
                </span>
              )}
            </span>
          ) : (
            <span>ASIN: —</span>
          )}

          <span className="flex items-center gap-1">
            Image:{" "}
            {!row.ai_returned_image ? (
              "—"
            ) : row.image_verified === true ? (
              <span className="text-green-600">✓</span>
            ) : row.image_verified === false ? (
              <span
                className="text-destructive"
                title={row.image_fail_reason ?? "Verification failed"}
              >
                ✗
              </span>
            ) : (
              "?"
            )}
          </span>

          {row.final_asin ? (
            <span className="flex items-center gap-1">
              Saved:{" "}
              {(() => {
                const url = buildAmazonUrl(row.final_asin);
                return url ? (
                  <Link
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline hover:text-foreground"
                  >
                    {row.final_asin}
                  </Link>
                ) : (
                  <span className="font-mono">{row.final_asin}</span>
                );
              })()}
            </span>
          ) : (
            <span>Saved: —</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
