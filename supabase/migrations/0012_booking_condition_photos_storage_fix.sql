-- 0012_booking_condition_photos_storage_fix.sql
-- SECURITY FIX -- the booking-condition-photos storage.objects INSERT/DELETE
-- policies (0009_booking_condition_photos.sql) already correctly required
-- the `authenticated` role, but only checked `bucket_id` -- not which
-- booking the object belonged to. Any signed-in user could therefore
-- upload into, or delete from, ANY other user's booking's condition-photo
-- folder, not just their own booking's.
--
-- Correction to an earlier written audit: the DELETE policy was NOT
-- missing its "to authenticated" role clause (it already had one) -- the
-- real gap is the missing ownership/participant check, fixed here.
--
-- WHAT THIS DOES
--   Re-creates the write and delete storage policies to additionally
--   require that the object's path starts with a booking id
--   (src/utils/bookingConditionPhotos.ts uploads to
--   `${bookingId}/${stage}/${filename}`, confirmed in source) that the
--   caller is a participant on (renter_id or owner_id), matching the
--   table-level policies already enforced on booking_condition_photos
--   itself (0009_booking_condition_photos.sql:56-86).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch the public SELECT (read) policy -- the bucket is
--   intentionally public-read, matching car-photos/avatars.
--   Does not touch the booking_condition_photos table or its own RLS.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: drop-then-create policies.

drop policy if exists booking_condition_photos_storage_write on storage.objects;
create policy booking_condition_photos_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-condition-photos'
    and exists (
      select 1 from public.bookings b
      where b.id = (storage.foldername(name))[1]
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

drop policy if exists booking_condition_photos_storage_delete on storage.objects;
create policy booking_condition_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-condition-photos'
    and exists (
      select 1 from public.bookings b
      where b.id = (storage.foldername(name))[1]
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );
