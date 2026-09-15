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
-- 0004_admin_phase3.sql
-- New tables for the last 7 admin sidebar sections: Settings, Promo Codes,
-- Featured Listings, Ads, Campaigns, Payments, Owner Payouts, Revenue.
-- (Payments and Revenue need NO new table -- they read the payment_status /
-- payment_method / total / subtotal / taxes / service_fee columns that
-- already exist on `bookings` since supabase_migration_multidevice.sql.)
--
-- Every table here is admin-owned: nothing on the mobile app reads or
-- writes these yet (see each admin page's own comments for exactly what
-- that means -- e.g. promo codes aren't wired into checkout, featured
-- listings aren't wired into the home screen). RLS is a single
-- for-all-operations admin policy per table -- there is no other actor.
--
-- Safe to re-run: every table is `create table if not exists`, every
-- policy is dropped-then-created, and the realtime step re-uses the same
-- existence check as 0003.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'flat')),
  discount_value numeric not null check (discount_value > 0),
  max_uses int,
  used_count int not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
drop policy if exists promo_codes_admin_all on public.promo_codes;
create policy promo_codes_admin_all on public.promo_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.featured_listings (
  id uuid primary key default gen_random_uuid(),
  car_id text not null references public.car_listings(id) on delete cascade,
  display_order int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (car_id)
);
alter table public.featured_listings enable row level security;
drop policy if exists featured_listings_admin_all on public.featured_listings;
create policy featured_listings_admin_all on public.featured_listings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  link_url text,
  placement text not null default 'home_banner',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists ads_admin_all on public.ads;
create policy ads_admin_all on public.ads for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A campaign groups an optional promo code + an optional ad under one
-- named push with its own goal and date range -- an orchestration layer
-- over the two, not a third overlapping discount/creative system.
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text,
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  ad_id uuid references public.ads(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
drop policy if exists campaigns_admin_all on public.campaigns;
create policy campaigns_admin_all on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Records a MANUAL payout an admin made to an owner (bank transfer done
-- outside the app -- there's no payment gateway/payout API integrated
-- yet). This is a ledger of what was paid, not a payment processor.
create table if not exists public.owner_payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_amount int not null,
  commission_amount int not null,
  net_amount int not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.owner_payouts enable row level security;
drop policy if exists owner_payouts_admin_all on public.owner_payouts;
create policy owner_payouts_admin_all on public.owner_payouts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Same realtime opt-in as 0003_enable_realtime.sql, for these 6 new tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings',
    'promo_codes',
    'featured_listings',
    'ads',
    'campaigns',
    'owner_payouts'
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
