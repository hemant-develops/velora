-- 0015_trip_extension_owner_only_approval.sql
-- SECURITY FIX -- booking_extension_requests_participants_update let
-- EITHER participant set a request's status to ANY allowed value
-- ('pending','approved','rejected','cancelled'), relying entirely on the
-- app UI (src/utils/tripExtensions.ts) to only ever drive the legal
-- transition. A renter could self-approve their own extension request via
-- a direct API call, which the app then reads as authorization to move
-- bookings.dropoff_date for free.
--
-- WHAT THIS DOES
--   Replaces the single combined policy with two narrower ones (safe to
--   OR together, since each is independently restrictive by role):
--     - the renter who created a pending request may only move it to
--       'cancelled'.
--     - only the booking's owner may move a pending request to 'approved'
--       or 'rejected'.
--   Both still require the row to currently be 'pending' before any
--   transition, matching the app's own existing state machine
--   (tripExtensions.ts only ever acts on a pending request today).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch booking_extension_requests_participants_select or
--   booking_extension_requests_renter_insert. Does not touch bookings
--   itself or the dropoff_date update tripExtensions.ts performs after a
--   successful approval (out of scope for this RLS fix).
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: drop-then-create policies.

drop policy if exists booking_extension_requests_participants_update on public.booking_extension_requests;

create policy booking_extension_requests_renter_cancel on public.booking_extension_requests
  for update to authenticated
  using (
    requested_by = auth.uid()
    and status = 'pending'
  )
  with check (
    requested_by = auth.uid()
    and status = 'cancelled'
  );

create policy booking_extension_requests_owner_respond on public.booking_extension_requests
  for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    status in ('approved', 'rejected')
    and exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and b.owner_id = auth.uid()
    )
  );
