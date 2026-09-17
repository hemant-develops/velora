-- 0025_public_website_read_access.sql
-- FEATURE -- Read-only public access for the new VELORA public website
-- (separate project: velora-web), which has NO login of its own and reads
-- Supabase with only the anon (publishable) key -- by design, so a website
-- visitor is never asked to sign in just to search/browse cars.
--
-- WHAT THIS DOES
--   Today, `car_listings`, `brands`, and `profiles` are only ever granted to
--   the `authenticated` role (see supabase_migration_multidevice.sql:100 for
--   car_listings, 0001_catalog_foundation.sql:87 for brands) -- a signed-out
--   anon-key request currently gets ZERO rows back from any of them, no
--   matter what RLS would otherwise allow, because Postgres checks table/
--   column GRANTs before RLS policies even run. This adds narrow, read-only
--   `anon` access to exactly the three things the public website's Search
--   Results and individual Car pages need, and nothing else:
--
--   1. car_listings -- anon may SELECT only where is_active = true (a new,
--      separate policy; the existing authenticated policy and its
--      is_active=true OR owner_id=auth.uid() logic are completely
--      untouched). Same columns an authenticated renter already sees for
--      any active listing today -- price, location, photos, features,
--      rating, description -- nothing here is owner-personal data.
--
--   2. brands -- anon may SELECT only where is_active = true (never a
--      pending custom brand awaiting review -- see
--      0024_manual_brand_entry.sql). Just name/logo/display_order.
--
--   3. profiles -- anon may SELECT ONLY the columns id, full_name,
--      avatar_url (a column-level grant -- Postgres enforces this
--      independently of any RLS policy, so email/phone/role/deleted_at
--      etc. can never leak through this grant even if a future policy
--      change were sloppy), and only for a profile that currently owns at
--      least one active listing. This is the "owner basic profile" shown
--      on a car's public page -- name + avatar only, exactly matching what
--      the mobile app's own OwnerPublicProfileScreen already shows,
--      never a phone number or email (those stay authenticated-only,
--      exactly as today -- the mobile app is still the only place a real
--      contact/booking conversation happens).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not grant anon INSERT/UPDATE/DELETE on anything -- the public
--   website is read-only, full stop; every write (listing a car, editing a
--   profile, booking) still requires the mobile app's real authenticated
--   session, completely unchanged. Does not touch reviews, bookings,
--   messages, notifications, or any other table -- a car's aggregate
--   rating/review_count already lives on car_listings itself (see
--   0014_car_rating_trigger.sql), so the public site never needs to read
--   individual review rows (or their authors) at all. Does not change the
--   existing `authenticated` grants or policies on any of these three
--   tables in any way.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with DROP POLICY IF EXISTS; GRANT is idempotent.

-- ---------------------------------------------------------------------------
-- 1. car_listings -- public read of active listings only
-- ---------------------------------------------------------------------------
grant select on public.car_listings to anon;

drop policy if exists car_listings_select_public on public.car_listings;
create policy car_listings_select_public on public.car_listings
  for select to anon
  using (is_active = true);

-- ---------------------------------------------------------------------------
-- 2. brands -- public read of the reviewed/active catalog only
-- ---------------------------------------------------------------------------
grant select on public.brands to anon;

drop policy if exists brands_select_public on public.brands;
create policy brands_select_public on public.brands
  for select to anon
  using (is_active = true);

-- ---------------------------------------------------------------------------
-- 3. profiles -- public read of name + avatar ONLY, and only for an owner
--    who currently has at least one active listing
-- ---------------------------------------------------------------------------
grant select (id, full_name, avatar_url) on public.profiles to anon;

drop policy if exists profiles_select_public_owner on public.profiles;
create policy profiles_select_public_owner on public.profiles
  for select to anon
  using (
    exists (
      select 1 from public.car_listings cl
      where cl.owner_id = profiles.id and cl.is_active = true
    )
  );
