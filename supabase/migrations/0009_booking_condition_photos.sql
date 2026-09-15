-- 0009_booking_condition_photos.sql
-- PHASE 7 -- Pickup/Return Condition Photos.
--
-- NOT required for existing bookings to keep working -- this is a brand-new,
-- separate table, not a new column on `bookings` (which this repo's own
-- BookingsContext.createBooking always-includes on every insert -- adding a
-- column there would make THIS migration required for every booking, exactly
-- the trap 0007/car_listings avoided by using its own always-include INSERT
-- differently). Nothing breaks if this hasn't been run yet: the new
-- fetchConditionPhotos() util catches any error (including "relation does
-- not exist") and returns an empty list, and BookingDetailsScreen's new
-- Condition Photos section simply shows nothing to add/view until it has.
-- Same fail-open pattern as car_blocked_dates (0008) and
-- conversations.archived_for_* (0005).
--
-- WHAT THIS DOES
--   A table of photo rows, one per uploaded pickup/return condition photo,
--   referencing the existing (untracked-schema but confirmed-real, per
--   BookingsContext's own BookingRow/insert) bookings.id / renter_id /
--   owner_id columns. Both the renter and the owner on a booking can view,
--   add, and remove condition photos for that booking -- either side may
--   want to document the car's condition at pickup or return.
--
--   Also creates a new, dedicated public Storage bucket
--   ('booking-condition-photos') and matching storage.objects policies,
--   mirroring the existing car-photos/avatars buckets' public-read,
--   authenticated-write pattern (see src/utils/uploadImage.ts) -- those
--   buckets were provisioned outside this repo's tracked migrations, so this
--   is the first tracked migration to set one up; it only touches the new
--   bucket's own policies, nothing existing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does NOT touch the `bookings` table itself or any existing RPC/trigger
--   (e.g. velora_set_booking_owner_id) -- their exact current definitions
--   aren't part of this repo's tracked migrations, so this only adds a new,
--   fully-controlled table alongside them and reads bookings.renter_id/
--   owner_id (confirmed real columns) via a read-only EXISTS subquery.
--
-- Safe to re-run: create-if-not-exists / drop-then-create policies.

create table if not exists public.booking_condition_photos (
  id          uuid primary key default gen_random_uuid(),
  booking_id  text not null references public.bookings (id) on delete cascade,
  stage       text not null check (stage in ('pickup', 'return')),
  url         text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists booking_condition_photos_booking_id_idx
  on public.booking_condition_photos (booking_id);

alter table public.booking_condition_photos enable row level security;

drop policy if exists booking_condition_photos_participants_select on public.booking_condition_photos;
create policy booking_condition_photos_participants_select on public.booking_condition_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_condition_photos.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

drop policy if exists booking_condition_photos_participants_insert on public.booking_condition_photos;
create policy booking_condition_photos_participants_insert on public.booking_condition_photos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_condition_photos.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

drop policy if exists booking_condition_photos_participants_delete on public.booking_condition_photos;
create policy booking_condition_photos_participants_delete on public.booking_condition_photos
  for delete to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_condition_photos.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

-- Storage bucket for the actual photo bytes.
insert into storage.buckets (id, name, public)
values ('booking-condition-photos', 'booking-condition-photos', true)
on conflict (id) do nothing;

drop policy if exists booking_condition_photos_storage_read on storage.objects;
create policy booking_condition_photos_storage_read on storage.objects
  for select
  using (bucket_id = 'booking-condition-photos');

drop policy if exists booking_condition_photos_storage_write on storage.objects;
create policy booking_condition_photos_storage_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'booking-condition-photos');

drop policy if exists booking_condition_photos_storage_delete on storage.objects;
create policy booking_condition_photos_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'booking-condition-photos');
