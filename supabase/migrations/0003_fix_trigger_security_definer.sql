-- =============================================================================
-- Fix RLS failure when a contributor suggests pending gear.
-- =============================================================================
-- The `on_gear_inserted` trigger inserts into public.admin_notifications,
-- but that table has no INSERT policy (reads and updates are admin-only).
-- When a non-admin inserts a gear_items row, the trigger's insert fails
-- with:
--   "new row violates row-level security policy for table admin_notifications"
--
-- Fix: mark the trigger function SECURITY DEFINER so it runs with the
-- privileges of the function owner (postgres), bypassing RLS. Triggers
-- are internal machinery, not user-initiated writes — this is the right
-- tool. Same treatment for resolve_gear_notifications for symmetry.
-- =============================================================================

create or replace function public.notify_pending_gear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.admin_notifications (type, gear_item_id)
    values ('new_gear_pending', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.resolve_gear_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
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
