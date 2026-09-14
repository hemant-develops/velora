-- 0003_enable_realtime.sql
-- Turns on Supabase Realtime change events for the tables the admin panel
-- (Dashboard, Users, Owners, Cars, Bookings, Reports, Brands & Models,
-- Notifications) live-updates from, so a booking created / car listed /
-- report filed on the mobile app shows up in the admin panel without a
-- manual refresh.
--
-- Realtime respects RLS: a subscriber only receives an event for a row it
-- could already SELECT. So an admin needs the matching *_select_admin
-- policy from 0002_admin_phase2.sql for a table's events to actually
-- arrive -- this migration only opens the pipe, 0002 is what lets admin
-- read through it. Run 0002 first (or alongside) if you haven't yet.
--
-- Safe to re-run: each table is checked against the publication before
-- being added, so running this twice is a no-op the second time.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'car_listings',
    'bookings',
    'reports',
    'car_models',
    'brands',
    'notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
