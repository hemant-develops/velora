-- 0002_admin_phase2.sql
-- Adds the admin-side RLS policies the Phase 2 admin panel screens need.
-- Phase A (0001_catalog_foundation.sql) and the admin foundation migration
-- (run directly via the Supabase SQL editor, not saved as a file at the
-- time -- admin_users, is_admin(), and admin-read policies on
-- profiles/car_listings/bookings) already exist. This migration only ADDS
-- new policies/constraints; it does not touch anything those already cover.
--
-- Safe to re-run: every policy is dropped-then-created, and the
-- notifications CHECK constraint is located dynamically instead of by a
-- guessed name, so a second run is a no-op rather than an error.
--
-- Run this as ONE script in the Supabase SQL editor. If you'd rather run it
-- in smaller pieces, it's already broken into five numbered chunks below
-- with blank-line separators -- copy one chunk at a time.

-- ============================================================
-- 1. Brands & Models admin visibility + creation
--    (car_models_select currently only shows an admin the models THEY
--    personally submitted -- is_active=true or created_by=auth.uid() --
--    not every owner's pending custom submissions. And there was never an
--    admin INSERT policy for adding canonical models directly.)
-- ============================================================
drop policy if exists car_models_select_admin on public.car_models;
create policy car_models_select_admin
  on public.car_models
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists car_models_admin_insert on public.car_models;
create policy car_models_admin_insert
  on public.car_models
  for insert
  to authenticated
  with check (public.is_admin());

-- ============================================================
-- 2. Cars admin moderation (hide/unhide a listing)
--    (admin foundation gave admins SELECT on car_listings already; this
--    adds UPDATE so the admin Cars page's Hide/Unhide button works.)
-- ============================================================
drop policy if exists car_listings_update_admin on public.car_listings;
create policy car_listings_update_admin
  on public.car_listings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 3. Reports moderation queue
--    (reports_select / reports_insert are both scoped to
--    reporter_id = auth.uid() only -- no admin visibility existed.)
-- ============================================================
drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin
  on public.reports
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin
  on public.reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 4. Notifications admin visibility (for a future admin log/compose view)
--    (notifications_select / notifications_update are both scoped to
--    user_id = auth.uid() only -- no admin visibility existed.)
-- ============================================================
drop policy if exists notifications_select_admin on public.notifications;
create policy notifications_select_admin
  on public.notifications
  for select
  to authenticated
  using (public.is_admin());

-- ============================================================
-- 5. Allow a 4th notification type, 'admin_broadcast', for admin-composed
--    announcements sent via the existing create_notification() RPC. The
--    mobile app never switches on notification.type to decide how to
--    render a row (title/message/created_at/read are all that's shown),
--    so this is additive and doesn't require a mobile app change.
--    The constraint is located dynamically (not by a guessed name) so
--    this step is safe to re-run.
-- ============================================================
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'notifications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%';

  if existing_constraint is not null then
    execute format('alter table public.notifications drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('booking_created', 'booking_status', 'message', 'admin_broadcast'));
