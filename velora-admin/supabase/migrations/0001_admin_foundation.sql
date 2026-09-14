-- VELORA Admin Website -- Phase 1: Admin Foundation
--
-- WHAT THIS DOES
--   1. Creates admin_users (who is an admin) and admin_audit_log (what
--      admins have done), both with RLS locked down.
--   2. Creates is_admin(), a SECURITY DEFINER helper any RLS policy can
--      call to check "is the current user an admin."
--   3. Adds ONE new, additional SELECT policy per table the admin
--      dashboard needs to read (profiles, car_listings, bookings) that
--      grants read access ONLY when is_admin() is true.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - It does not touch, replace, or weaken any existing RLS policy on
--     profiles / car_listings / bookings. Postgres evaluates multiple
--     permissive policies for the same command with OR, so this is purely
--     additive: every existing renter/owner policy keeps working exactly
--     as it does today, unchanged.
--   - It does not add or repurpose any column on `profiles` (in
--     particular it does NOT touch `profiles.role`, which the mobile app's
--     renter/owner mode-switching logic depends on -- see
--     src/context/AuthContext.tsx in the main repo). Admin status is
--     intentionally a completely separate concept from that column.
--   - It does not grant admin access to anyone. admin_users starts empty.
--     The FIRST admin must be added manually from the Supabase dashboard
--     (Table Editor -> admin_users -> Insert row, or SQL Editor):
--
--       insert into public.admin_users (user_id) values ('<your-auth-uid>');
--
--     Find <your-auth-uid> under Authentication -> Users in the dashboard.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   This project keeps no other tracked migrations (the existing `supabase/`
--   folder in the main VELORA repo only has an Edge Function, no SQL
--   migration history), so this is safe to run standalone, once.

-- ---------------------------------------------------------------------------
-- 1. admin_users -- who is allowed into the admin website.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- A signed-in user may check ONLY their own admin status -- never list who
-- else is an admin, never see who granted access. This is intentionally
-- the only policy on this table: there is no INSERT/UPDATE/DELETE policy at
-- all, so granting/revoking admin access can only be done from the
-- Supabase dashboard (Table Editor / SQL Editor), never from the admin
-- website, the mobile app, or any client -- there is no self-service
-- "become an admin" path anywhere in Phase 1.
drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. is_admin() -- reusable check, callable from client code (supabase.rpc)
--    and from other tables' RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Additive admin-read policies -- exactly the three tables the Phase 1
--    dashboard reads. Nothing else is touched. Each is a NEW policy
--    alongside whatever policies already exist on that table.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists car_listings_select_admin on public.car_listings;
create policy car_listings_select_admin
  on public.car_listings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists bookings_select_admin on public.bookings;
create policy bookings_select_admin
  on public.bookings
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. admin_audit_log -- append-only record of admin actions.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id),
  -- Snapshot of the admin's email at the moment of the action (mirrors the
  -- existing `renter_name`/`renter_avatar` snapshot pattern already used on
  -- `bookings` in the main app -- see src/types/index.ts's comment on
  -- Booking.renterName). Avoids ever needing to join/read auth.users from
  -- the client, which RLS wouldn't allow anyway.
  admin_email text,
  action text not null,
  target_type text,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- Admins can read the full log (every admin's entries) -- but only admins.
drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin
  on public.admin_audit_log
  for select
  to authenticated
  using (public.is_admin());

-- Admins can insert ONLY their own entries, and only while genuinely an
-- admin -- nobody can forge another admin's id, and a user who is removed
-- from admin_users immediately loses insert access too.
drop policy if exists admin_audit_log_insert_admin on public.admin_audit_log;
create policy admin_audit_log_insert_admin
  on public.admin_audit_log
  for insert
  to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- Deliberately no UPDATE or DELETE policy at all, for anyone, including
-- admins -- audit history is append-only from every client's perspective.
-- Only direct Supabase dashboard / service-role access (outside RLS) could
-- ever alter or remove a row.

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
