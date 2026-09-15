-- 0004_buffer_time.sql
-- PHASE 3 -- Buffer Time Between Bookings.
--
-- *** REQUIRED before using this build's app code (same as 0003). ***
-- CarsContext.carToRow now unconditionally includes this column (null when
-- unset) -- so run this BEFORE testing the owner "List a Car" / "Edit Car"
-- screen on this build, exactly like 0003_duration_pricing_km.sql.
--
-- WHAT THIS DOES
--   Adds ONE new, nullable column to public.car_listings: buffer_hours
--   integer. Purely additive -- every existing row gets NULL, which the app
--   already treats as "no buffer noted" (see Car.bufferHours in
--   types/index.ts).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   buffer_hours is INFORMATIONAL ONLY -- it is never read by
--   create_local_car_booking_hold, get_car_taken_count, or any other
--   availability check. Those RPCs remain exactly as they were: a
--   day-granularity gate that already refuses a second booking on the same
--   calendar day once a car's quantity is exhausted. Actually ENFORCING a
--   sub-day buffer on top of that would require redesigning those RPCs to
--   work in timestamps instead of dates -- the same explicitly out-of-scope
--   change flagged in 0002_booking_duration.sql's own comment. This column
--   exists purely so an owner can note their own cleaning/turnaround time
--   and see it on their dashboard and car calendar as a reminder when
--   deciding whether to accept a pending request near an existing booking.
--
-- Safe to re-run: add-if-not-exists / drop-then-add.
alter table public.car_listings
  add column if not exists buffer_hours integer;

alter table public.car_listings drop constraint if exists car_listings_buffer_hours_nonneg;
alter table public.car_listings add constraint car_listings_buffer_hours_nonneg
  check (buffer_hours is null or buffer_hours >= 0);
