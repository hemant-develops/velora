-- 0008_car_blocked_dates.sql
-- PHASE 6 -- Block Car (owner-blocked dates).
--
-- NOT required for existing car saves / bookings to keep working -- this is
-- a brand-new, separate table, not a new column on an existing row every
-- save already writes (unlike 0007 alongside it). Nothing breaks if this
-- hasn't been run yet: OwnerCarCalendarScreen's fetch just returns an empty
-- blocked-dates list (caught and treated as "nothing blocked"), and the new
-- check inside BookingsContext.createBooking fails OPEN on a lookup error --
-- see that function's own comment and src/utils/blockedDates.ts.
--
-- WHAT THIS DOES
--   A day-granularity table: one row per (car, calendar day) an owner has
--   manually blocked off (maintenance, personal use, anything else that
--   isn't a real booking). Deliberately ONE ROW PER DAY, not a date range --
--   this matches the day-granularity every other availability concept in
--   this app already uses (BLOCKING_STATUSES, dateRangesOverlap, the
--   create_local_car_booking_hold RPC itself), and it keeps both sides of
--   this feature simple: the owner's calendar just toggles a single tapped
--   day, and the renter-side check is a plain date range containment query.
--
--   RLS: any signed-in user can read a car's blocked dates (a renter
--   browsing a car they don't own still needs to know which dates are
--   blocked before they try to book them) -- but only that car's owner can
--   add or remove a blocked date on it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does NOT touch create_local_car_booking_hold, get_car_taken_count, or
--   any other existing RPC/trigger -- those remain completely unaware of
--   this table, for the same reason 0005/0006 avoided touching the
--   conversation-bump trigger and the create_notification RPC: their exact
--   current definitions aren't part of this repo's tracked migrations, so
--   editing them blind risks breaking real booking creation, which is far
--   higher-stakes than anything else touched so far. Enforcement instead
--   lives entirely in the client (BookingsContext.createBooking, a file
--   this project fully controls) as an ADVISORY gate on top of the existing
--   RPC-based one -- meaning a determined client bypassing the app could
--   still create a hold over a blocked date; this is a disclosed limitation,
--   the same class as Car.bufferHours being informational-only.
--
-- Safe to re-run: create-if-not-exists / drop-then-create policies.
create table if not exists public.car_blocked_dates (
  car_id       text not null references public.car_listings (id) on delete cascade,
  blocked_date date not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (car_id, blocked_date)
);

alter table public.car_blocked_dates enable row level security;

drop policy if exists car_blocked_dates_select_all on public.car_blocked_dates;
create policy car_blocked_dates_select_all on public.car_blocked_dates
  for select to authenticated
  using (true);

drop policy if exists car_blocked_dates_owner_insert on public.car_blocked_dates;
create policy car_blocked_dates_owner_insert on public.car_blocked_dates
  for insert to authenticated
  with check (
    exists (
      select 1 from public.car_listings cl
      where cl.id = car_blocked_dates.car_id and cl.owner_id = auth.uid()
    )
  );

drop policy if exists car_blocked_dates_owner_delete on public.car_blocked_dates;
create policy car_blocked_dates_owner_delete on public.car_blocked_dates
  for delete to authenticated
  using (
    exists (
      select 1 from public.car_listings cl
      where cl.id = car_blocked_dates.car_id and cl.owner_id = auth.uid()
    )
  );
