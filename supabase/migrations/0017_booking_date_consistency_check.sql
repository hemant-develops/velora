-- 0017_booking_date_consistency_check.sql
-- SECURITY FIX -- BookingsContext.tsx:344-346 rejects dropoff_date <
-- pickup_date client-side, but the database itself had no matching CHECK,
-- so a direct API insert/update could set an inverted date range.
--
-- WHAT THIS DOES
--   Adds a CHECK constraint requiring dropoff_date >= pickup_date (equal is
--   allowed -- short/hourly rentals with pickup and dropoff on the same
--   calendar day are a normal case, see pickup_time/dropoff_time).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not add any overlap/exclusion constraint between different
--   bookings for the same car -- that requires knowing car_listings.quantity
--   at constraint-evaluation time (a car with quantity > 1 can legitimately
--   have multiple overlapping bookings), which a simple CHECK/EXCLUDE
--   constraint cannot express without either duplicating the untracked
--   hold RPC's own counting logic (risking it disagreeing with that RPC)
--   or first recovering that RPC's real definition. Left for the
--   live-Supabase-verification step already flagged in the prior recovery
--   report, not attempted here.
--
-- NOT YET APPLIED TO PRODUCTION. If any existing row already violates this
-- (dropoff_date < pickup_date), this ALTER TABLE will fail with a clear
-- Postgres error rather than silently succeeding -- check for that before
-- applying, e.g.: select id from public.bookings where dropoff_date < pickup_date;
--
-- Safe to re-run: `if not exists` guard via a DO block.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_dropoff_after_pickup'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_dropoff_after_pickup check (dropoff_date >= pickup_date);
  end if;
end $$;
