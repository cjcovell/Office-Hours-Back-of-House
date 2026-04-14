-- =============================================================================
-- Storage: gear-images and headshots buckets
-- =============================================================================
-- Both buckets are PUBLIC so the public site can render images directly.
-- RLS on storage.objects controls who can write.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('gear-images', 'gear-images', true),
  ('headshots',   'headshots',   true)
on conflict (id) do update set public = excluded.public;

-- ---------- Public read ---------------------------------------------------
create policy "storage: public read gear-images"
  on storage.objects for select
  using (bucket_id = 'gear-images');

create policy "storage: public read headshots"
  on storage.objects for select
  using (bucket_id = 'headshots');

-- ---------- Authenticated upload ------------------------------------------
-- Any signed-in user can upload. We don't lock paths to users here because
-- the kit editor flow needs contributors to upload gear images while only
-- the admin will set the final canonical URL on the gear_items row.
create policy "storage: authed upload gear-images"
  on storage.objects for insert
  with check (
    bucket_id = 'gear-images' and auth.uid() is not null
  );

-- For headshots, lock the upload path to the contributor the user is
-- linked to (or admin can upload anywhere). Path convention:
--   <contributor_id>/<filename>
create policy "storage: linked or admin upload headshots"
  on storage.objects for insert
  with check (
    bucket_id = 'headshots' and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.linked_contributor_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- ---------- Owner or admin update / delete --------------------------------
create policy "storage: owner or admin update gear-images"
  on storage.objects for update
  using (
    bucket_id = 'gear-images'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "storage: owner or admin delete gear-images"
  on storage.objects for delete
  using (
    bucket_id = 'gear-images'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "storage: owner or admin update headshots"
  on storage.objects for update
  using (
    bucket_id = 'headshots'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "storage: owner or admin delete headshots"
  on storage.objects for delete
  using (
    bucket_id = 'headshots'
    and (owner = auth.uid() or public.is_admin(auth.uid()))
  );
