-- 0002_booking_duration.sql
-- PHASE 1 -- Booking Duration System.
--
-- OPTIONAL FOR THIS PHASE. Nothing in the Phase 1 app code writes to this
-- column yet (BookingScreen/BookingsContext.createBooking were deliberately
-- left unchanged on the Supabase-insert side, so booking creation keeps
-- working identically whether or not this migration has been run). Run this
-- only when you're ready for the fast-follow that actually persists and
-- displays the renter's exact chosen duration (in hours) on
-- BookingConfirmationScreen / BookingDetailsScreen / MyRentsScreen /
-- OwnerDashboardScreen after a booking is created -- today those screens
-- keep showing the existing `days` count, unchanged.
--
-- WHAT THIS DOES
--   Adds ONE new, nullable column to the existing `public.bookings` table:
--   `duration_hours integer`. Purely additive -- every existing row simply
--   gets NULL here, nothing already stored changes or breaks.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - Does NOT touch pickup_date/dropoff_date (still `date`, day-granularity)
--     or the existing create_local_car_booking_hold / get_car_taken_count /
--     set_local_car_booking_hold_status RPCs -- those remain the exact same
--     atomic, day-granularity availability gate they are today. True
--     hour-precision overlap detection (e.g. two separate 6-hour bookings on
--     the same calendar day that don't actually overlap in time) would
--     require redesigning those RPCs to accept timestamps instead of dates
--     -- a materially bigger, riskier change to the app's core booking
--     safety mechanism, deliberately OUT OF SCOPE for this phase and not
--     done here. Flagging this explicitly rather than silently working
--     around it.
--   - Does NOT add a CHECK constraint tying duration_hours to
--     dropoff_date - pickup_date, since pickup_date/dropoff_date only carry
--     day precision -- a 6-hour and a 30-hour booking with the same pickup
--     day can both legitimately have the same pickup_date/dropoff_date pair.
--
-- Safe to re-run: `add column if not exists`.
alter table public.bookings
  add column if not exists duration_hours integer;

-- Loose sanity check only (not a source of truth for availability) -- NULL
-- (a booking created before this migration, or before the app is wired to
-- send this field) is explicitly allowed so no existing/future row can ever
-- violate this constraint by omission.
alter table public.bookings drop constraint if exists bookings_duration_hours_min;
alter table public.bookings add constraint bookings_duration_hours_min
  check (duration_hours is null or duration_hours >= 6);
