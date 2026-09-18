-- 0031_media_storage_buckets.sql
-- Storage required by src/utils/uploadImage.ts for profile avatars and car
-- listing photos. Public reads are intentional because both media types are
-- displayed to marketplace users; writes stay limited to the owner's folder.

insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists car_photos_insert on storage.objects;
create policy car_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists car_photos_update on storage.objects;
create policy car_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists car_photos_delete on storage.objects;
create policy car_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists car_photos_select on storage.objects;
create policy car_photos_select on storage.objects
  for select to public
  using (bucket_id = 'car-photos');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to public
  using (bucket_id = 'avatars');
