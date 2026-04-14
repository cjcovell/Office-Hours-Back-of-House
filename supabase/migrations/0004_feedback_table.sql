-- =============================================================================
-- Feedback loop — in-app feedback capture table.
-- =============================================================================
-- Authenticated users can insert their own feedback and read their own rows.
-- Admins (via public.is_admin) can read and update any row.
--
-- Differs from the template in FEEDBACK_LOOP_SETUP.md in one place: the
-- original uses `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` for
-- admin access. This project stores role on public.users, so we use the
-- public.is_admin(uid) helper instead. Same behavior.
-- =============================================================================

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'general' check (type in ('bug', 'feature', 'general')),
  message     text not null,
  page        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index feedback_unresolved_idx on public.feedback (created_at desc) where resolved_at is null;
create index feedback_user_idx       on public.feedback (user_id);

alter table public.feedback enable row level security;

-- Users can insert their own feedback.
create policy "feedback: own insert"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Users can read their own; admins can read all.
create policy "feedback: read own or admin"
  on public.feedback for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Only admins can mark resolved / edit.
create policy "feedback: admin update"
  on public.feedback for update
  using (public.is_admin(auth.uid()));
