-- =============================================================================
-- Office Hours: Back of House — initial schema
-- =============================================================================
-- Tables:    users, contributors, gear_items, kit_entries, admin_notifications
-- Enums:     gear_status, role_type, user_role
-- Triggers:  auth.users insert -> public.users mirror
--            gear_items insert (pending) -> admin notification
--            gear_items pending -> active -> resolve notification
-- RLS:       Public reads; contributor edits own kit; admin manages everything.
-- =============================================================================

-- ---------- Extensions ------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------- Enums -----------------------------------------------------------
create type public.gear_status as enum ('pending', 'active');
create type public.role_type   as enum ('on_air', 'crew');
create type public.user_role   as enum ('contributor', 'admin');

-- ---------- Tables ----------------------------------------------------------

-- users mirrors auth.users so we can attach roles + a contributor link.
create table public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text unique not null,
  role                   public.user_role not null default 'contributor',
  linked_contributor_id  uuid unique,
  created_at             timestamptz not null default now()
);

create table public.contributors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  bio           text,
  headshot_url  text,
  social_links  jsonb not null default '{}'::jsonb,
  show_role     text not null,
  role_types    public.role_type[] not null default '{}',
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);
create index contributors_display_order_idx on public.contributors(display_order);

create table public.gear_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brand        text not null,
  model        text not null,
  category     text not null,
  description  text,
  image_url    text,
  asin         text,
  status       public.gear_status not null default 'pending',
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index gear_items_status_idx   on public.gear_items(status);
create index gear_items_category_idx on public.gear_items(category);
create index gear_items_search_idx   on public.gear_items
  using gin (to_tsvector('english',
    coalesce(name, '')  || ' ' ||
    coalesce(brand, '') || ' ' ||
    coalesce(model, '')
  ));

create table public.kit_entries (
  id                uuid primary key default gen_random_uuid(),
  contributor_id    uuid not null references public.contributors(id) on delete cascade,
  gear_item_id      uuid not null references public.gear_items(id) on delete cascade,
  notes             text,
  category_override text,
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (contributor_id, gear_item_id)
);
create index kit_entries_contributor_idx on public.kit_entries(contributor_id);
create index kit_entries_gear_idx        on public.kit_entries(gear_item_id);

create table public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  gear_item_id uuid not null references public.gear_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index admin_notifications_unresolved_idx
  on public.admin_notifications(resolved_at) where resolved_at is null;

-- Wire the deferred FK from users -> contributors (chicken-and-egg).
alter table public.users
  add constraint users_linked_contributor_fk
  foreign key (linked_contributor_id) references public.contributors(id)
  on delete set null;

-- ---------- Helpers ---------------------------------------------------------

-- is_admin uses SECURITY DEFINER to break the RLS recursion when policies
-- on `users` need to call it.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = uid and role = 'admin'
  );
$$;

-- ---------- Triggers --------------------------------------------------------

-- 1. Mirror new auth.users into public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 2. Pending gear -> admin notification.
create or replace function public.notify_pending_gear()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'pending' then
    insert into public.admin_notifications (type, gear_item_id)
    values ('new_gear_pending', new.id);
  end if;
  return new;
end;
$$;

create trigger on_gear_inserted
  after insert on public.gear_items
  for each row execute function public.notify_pending_gear();

-- 3. Pending -> active resolves any open notifications for that gear.
create or replace function public.resolve_gear_notifications()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    update public.admin_notifications
      set resolved_at = now()
      where gear_item_id = new.id and resolved_at is null;
  end if;
  return new;
end;
$$;

create trigger on_gear_status_change
  after update of status on public.gear_items
  for each row execute function public.resolve_gear_notifications();

-- ---------- Row Level Security ---------------------------------------------

alter table public.users               enable row level security;
alter table public.contributors        enable row level security;
alter table public.gear_items          enable row level security;
alter table public.kit_entries         enable row level security;
alter table public.admin_notifications enable row level security;

-- users -----------------------------------------------------------------
create policy "users: read own or admin"
  on public.users for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

create policy "users: admin update"
  on public.users for update
  using (public.is_admin(auth.uid()));

-- contributors ----------------------------------------------------------
create policy "contributors: public read"
  on public.contributors for select
  using (true);

create policy "contributors: admin insert"
  on public.contributors for insert
  with check (public.is_admin(auth.uid()));

create policy "contributors: admin or owner update"
  on public.contributors for update
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.linked_contributor_id = contributors.id
    )
  );

create policy "contributors: admin delete"
  on public.contributors for delete
  using (public.is_admin(auth.uid()));

-- gear_items ------------------------------------------------------------
-- Public read is OK: the catalog page filters by status='active' itself,
-- and contributor pages may want to show pending items (badged) so the
-- contributor can see what they suggested.
create policy "gear_items: public read"
  on public.gear_items for select
  using (true);

create policy "gear_items: authenticated insert"
  on public.gear_items for insert
  with check (auth.uid() is not null);

create policy "gear_items: admin update"
  on public.gear_items for update
  using (public.is_admin(auth.uid()));

create policy "gear_items: admin delete"
  on public.gear_items for delete
  using (public.is_admin(auth.uid()));

-- kit_entries -----------------------------------------------------------
create policy "kit_entries: public read"
  on public.kit_entries for select
  using (true);

create policy "kit_entries: contributor or admin insert"
  on public.kit_entries for insert
  with check (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.linked_contributor_id = contributor_id
    )
  );

create policy "kit_entries: contributor or admin update"
  on public.kit_entries for update
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.linked_contributor_id = contributor_id
    )
  );

create policy "kit_entries: contributor or admin delete"
  on public.kit_entries for delete
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.linked_contributor_id = contributor_id
    )
  );

-- admin_notifications ---------------------------------------------------
create policy "admin_notifications: admin read"
  on public.admin_notifications for select
  using (public.is_admin(auth.uid()));

create policy "admin_notifications: admin update"
  on public.admin_notifications for update
  using (public.is_admin(auth.uid()));
-- (Inserts happen via trigger, which runs as table owner.)
