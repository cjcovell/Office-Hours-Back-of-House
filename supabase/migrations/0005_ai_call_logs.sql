-- =============================================================================
-- AI call telemetry — logs every call to the AI Amazon-lookup pipeline.
-- =============================================================================
-- Admins get a /admin/ai-logs page showing these, so they can tell at a
-- glance whether the AI is invoking web_search, how often it's
-- hallucinating, how long calls take, etc. — without having to grep
-- Vercel function logs.
--
-- Inserted fire-and-forget from lib/ai/gear-enrich.ts after each AI call.
-- No PII beyond user_id + the query string the user typed.
-- =============================================================================

create table if not exists public.ai_call_logs (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  user_id             uuid references auth.users(id) on delete set null,
  fn                  text not null,                          -- 'enrichGearFromQuery' | 'lookupAmazonDetails' | 'diagnose'
  query               text not null,                          -- user-facing query or "brand name model"
  model_id            text not null,
  duration_ms         integer,
  step_count          integer,
  web_search_calls    integer,
  ai_returned_asin    text,                                   -- what the model returned (before verify)
  ai_returned_image   text,
  asin_verified       boolean,                                -- null if no ASIN returned
  asin_fail_reason    text,
  image_verified      boolean,                                -- null if no image returned
  image_fail_reason   text,
  final_asin          text,                                   -- what ended up saved (null if cleared)
  final_image         text,
  error               text                                    -- set if the AI call itself threw
);

create index ai_call_logs_created_idx    on public.ai_call_logs (created_at desc);
create index ai_call_logs_user_idx       on public.ai_call_logs (user_id);
create index ai_call_logs_fn_idx         on public.ai_call_logs (fn, created_at desc);

alter table public.ai_call_logs enable row level security;

-- Admin-only read. No one else ever needs to see these rows.
create policy "ai_call_logs: admin read"
  on public.ai_call_logs for select
  using (public.is_admin(auth.uid()));

-- Inserts are done from server code using the service role, which
-- bypasses RLS. No insert policy needed for regular users.
