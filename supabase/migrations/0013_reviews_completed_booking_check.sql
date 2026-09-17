-- 0013_reviews_completed_booking_check.sql
-- SECURITY FIX -- reviews_insert only checked `renter_id = auth.uid()`.
-- It never verified that booking_id refers to a real, completed booking
-- that renter actually took on that car, or that car_id matches the
-- booking. Any authenticated user could insert a review for any car,
-- with a fabricated booking_id, via a direct API call -- the app UI
-- (ReviewScreen.tsx) was the only thing preventing this.
--
-- WHAT THIS DOES
--   Tightens reviews_insert's WITH CHECK to additionally require that
--   booking_id references a real row in bookings where renter_id matches
--   the caller, car_id matches the review's car_id, and status = 'completed'.
--   This is a single existing permissive policy being replaced (not a
--   second policy added alongside it), which is required for RLS to
--   actually tighten rather than loosen (multiple permissive policies for
--   the same command are OR'd together in Postgres).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch reviews_select (public read stays public read) or the
--   reviews table schema. Does not touch bookings.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: drop-then-create policy.

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    renter_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.renter_id = auth.uid()
        and b.car_id = car_id
        and b.status = 'completed'
    )
  );
