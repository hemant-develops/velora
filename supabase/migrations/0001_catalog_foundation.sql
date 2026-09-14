-- =============================================================================
-- VELORA -- Catalog Foundation (Phase A: Brand -> Model)
-- =============================================================================
-- WHAT THIS MIGRATION DOES
--   1. Creates `public.brands` -- a proper table backing the brand list that
--      today lives only as a static array in src/data/brands.ts.
--   2. Creates `public.car_models` -- brand -> model line-ups (today's
--      static src/data/carModels.ts), PLUS support for an owner submitting a
--      model that isn't in the curated list yet ("Add manually"), which
--      lands as a pending (`is_active = false`, `is_custom = true`) row only
--      that owner (and, later, an admin) can see until it's reviewed.
--   3. Adds `car_listings.model_id` -- a new, NULLABLE foreign key. Purely
--      additive: every existing car_listings row keeps working unchanged
--      with model_id left null.
--   4. Adds a safe, re-runnable CHECK constraint on `car_listings.year`
--      (1990..current_year+1) -- but deliberately does NOT make `year`
--      NOT NULL at the DB level, so it can never break an existing row that
--      has no year set. "Year is mandatory" is enforced at the app/client
--      layer instead (see OwnerAddCarScreen's onSubmit validation).
--   5. Seeds `brands` with the 19 brands already in src/data/brands.ts
--      (SAME id values car_listings.brand_id already stores -- e.g.
--      'maruti', 'bmw' -- so this is a zero-backfill-risk upsert, not a
--      migration of existing data) plus the VELORA-recommended additions
--      (Force Motors, Citroen, BYD, Volvo, Lexus, Jaguar, Land Rover,
--      Porsche, Aston Martin, Maserati, Rolls-Royce).
--   6. Seeds `car_models` ONLY for the 13 brands that already have a
--      curated model list in src/data/carModels.ts. Every other brand
--      (the pre-existing exotic/global ones, and every brand newly added in
--      step 5) intentionally gets NO seeded models -- exactly the existing
--      "falls back to Add Manually" behavior, not fabricated data.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - It does not touch `car_listings.brand_id` (still `text`, still the
--     single source of truth for a listing's brand) or backfill
--     `model_id` on any existing row.
--   - It does not remove src/data/brands.ts / src/data/carModels.ts from
--     the app repo -- they remain the seed-data SOURCE for this file and a
--     documented fallback; the app itself now reads brands/models from
--     these tables via CatalogContext, not from those static files.
--
-- CROSS-PROJECT DEPENDENCY
--   The admin-only RLS policies below (car_models_admin_update/delete,
--   brands_admin_write) call `public.is_admin()`. That function is created
--   by the SEPARATE admin-website project's own migration
--   (velora-admin/supabase/migrations/0001_admin_foundation.sql). Both
--   projects share the SAME Supabase database, so this migration REQUIRES
--   0001_admin_foundation.sql to have been run first -- if it hasn't,
--   the `create policy` statements referencing public.is_admin() below will
--   fail with "function public.is_admin() does not exist". Run
--   0001_admin_foundation.sql first if you haven't already.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   Safe to re-run: every `create table`/`create policy`/`add column` is
--   guarded, and the seed inserts are idempotent upserts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. brands
-- ---------------------------------------------------------------------------
-- `id` is `text`, not a generated uuid, and deliberately REUSES the exact
-- slug values already stored in car_listings.brand_id today (see
-- src/data/brands.ts) -- so every existing listing's brand_id already
-- correctly references a real row here with zero backfill.
create table if not exists public.brands (
  id             text primary key,
  name           text not null,
  logo_url       text,
  is_active      boolean not null default true,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists velora_brands_touch on public.brands;
create trigger velora_brands_touch
  before update on public.brands
  for each row execute function public.velora_touch_updated_at();

alter table public.brands enable row level security;

-- Every signed-in user (renter or owner) can browse the brand catalog.
drop policy if exists brands_select_authenticated on public.brands;
create policy brands_select_authenticated
  on public.brands
  for select
  to authenticated
  using (true);

-- Only an admin (per the admin project's public.is_admin()) can add, edit,
-- or retire a brand -- owners never write to this table directly, even for
-- their own custom submissions (that's what car_models.is_custom is for).
drop policy if exists brands_admin_write on public.brands;
create policy brands_admin_write
  on public.brands
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. car_models
-- ---------------------------------------------------------------------------
-- Unlike brands, `id` here is a fresh generated uuid -- there is no existing
-- "model id" anywhere in the app to preserve (OwnerAddCarScreen previously
-- only ever stored a free-text model name baked into car_listings.name).
create table if not exists public.car_models (
  id             uuid primary key default gen_random_uuid(),
  brand_id       text not null references public.brands (id) on delete cascade,
  name           text not null,
  display_name   text,
  body_type      text,
  fuel_type      text,
  transmission   text,
  seats          integer,
  is_ev          boolean not null default false,
  is_hybrid      boolean not null default false,
  -- `is_active = false` is how a just-submitted custom model stays hidden
  -- from the public Model picker / Browse-by-Model chips until an admin
  -- reviews and activates it (see car_models_select below).
  is_active      boolean not null default true,
  -- true for anything an owner typed in via "Add manually" in the listing
  -- wizard; false for the curated, admin-seeded catalog.
  is_custom      boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Idempotent-safe uniqueness for the CURATED (non-custom) catalog only --
-- lets the seed insert below use `on conflict ... where is_custom = false`
-- to upsert cleanly on re-run, without ever colliding with two different
-- owners independently typing the same custom model name for a brand.
create unique index if not exists car_models_brand_name_canonical_uniq
  on public.car_models (brand_id, name)
  where is_custom = false;

create index if not exists car_models_brand_id_idx on public.car_models (brand_id);

drop trigger if exists velora_car_models_touch on public.car_models;
create trigger velora_car_models_touch
  before update on public.car_models
  for each row execute function public.velora_touch_updated_at();

alter table public.car_models enable row level security;

-- Everyone sees the reviewed/active catalog; an owner additionally sees
-- their OWN still-pending custom submissions (so their listing wizard shows
-- "Swift Custom (pending review)" back to them), but never another owner's
-- pending submissions.
drop policy if exists car_models_select on public.car_models;
create policy car_models_select
  on public.car_models
  for select
  to authenticated
  using (is_active = true or created_by = auth.uid());

-- An owner may insert ONLY a pending custom row attributed to themselves --
-- never a directly-active/canonical entry, and never on another user's
-- behalf. This is what OwnerAddCarScreen's "Add manually" flow calls.
drop policy if exists car_models_insert_custom on public.car_models;
create policy car_models_insert_custom
  on public.car_models
  for insert
  to authenticated
  with check (
    is_custom = true
    and is_active = false
    and created_by = auth.uid()
  );

-- Only an admin can edit an existing row (e.g. approving a pending custom
-- model by flipping is_active/is_custom, or editing the curated catalog).
drop policy if exists car_models_admin_update on public.car_models;
create policy car_models_admin_update
  on public.car_models
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Only an admin can delete a model (e.g. rejecting a pending custom
-- submission, or retiring a discontinued model).
drop policy if exists car_models_admin_delete on public.car_models;
create policy car_models_admin_delete
  on public.car_models
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. car_listings.model_id -- purely additive, nullable FK
-- ---------------------------------------------------------------------------
alter table public.car_listings
  add column if not exists model_id uuid references public.car_models (id) on delete set null;

create index if not exists car_listings_model_id_idx on public.car_listings (model_id);

-- ---------------------------------------------------------------------------
-- 4. car_listings.year -- safe, re-runnable range CHECK (NOT NOT-NULL)
-- ---------------------------------------------------------------------------
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so this is made
-- idempotent via drop-then-add instead. `year is null` is explicitly
-- allowed by the constraint itself -- existing rows with no year keep
-- passing it -- "year is mandatory" is enforced only in the app's own
-- validation (OwnerAddCarScreen.onSubmit), never at the DB level, so this
-- can never lock out a legacy row.
alter table public.car_listings drop constraint if exists car_listings_year_range;
alter table public.car_listings add constraint car_listings_year_range
  check (year is null or (year between 1990 and extract(year from now())::int + 1));

-- ---------------------------------------------------------------------------
-- 5. Seed: brands
-- ---------------------------------------------------------------------------
-- The first 19 rows use the EXACT id values already stored in
-- car_listings.brand_id today (src/data/brands.ts) -- this is an upsert of
-- display metadata (name/logo/order) for brands that already implicitly
-- exist via existing listings, never a change to any listing's brand_id.
-- `on conflict` intentionally leaves `is_active` alone on re-run, so an
-- admin who later deactivates a brand doesn't get silently reactivated by
-- re-running this file.
insert into public.brands (id, name, logo_url, display_order) values
  ('maruti',        'Maruti Suzuki',        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=1200&auto=format&fit=crop', 10),
  ('hyundai',       'Hyundai',              'https://images.unsplash.com/photo-1602777624112-42a19caab449?q=80&w=1200&auto=format&fit=crop', 20),
  ('tata',          'Tata Motors',          'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=1200&auto=format&fit=crop', 30),
  ('mahindra',      'Mahindra',             'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?q=80&w=1200&auto=format&fit=crop', 40),
  ('toyota',        'Toyota',               'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1200&auto=format&fit=crop', 50),
  ('kia',           'Kia',                  'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?q=80&w=1200&auto=format&fit=crop', 60),
  ('honda',         'Honda',                'https://images.unsplash.com/photo-1590362891991-f776e747a588?q=80&w=1200&auto=format&fit=crop', 70),
  ('renault',       'Renault',              'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop', 80),
  ('nissan',        'Nissan',               'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=1200&auto=format&fit=crop', 90),
  ('mg',            'JSW MG Motor India',   'https://images.unsplash.com/photo-1493238792000-8113da705763?q=80&w=1200&auto=format&fit=crop', 100),
  ('volkswagen',    'Volkswagen',           'https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1200&auto=format&fit=crop', 110),
  ('skoda',         'Skoda',                'https://images.unsplash.com/photo-1554744512-d6c603f27c54?q=80&w=1200&auto=format&fit=crop', 120),
  ('jeep',          'Jeep',                 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?q=80&w=1200&auto=format&fit=crop', 130),
  ('tesla',         'Tesla',                'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?q=80&w=1200&auto=format&fit=crop', 140),
  ('bmw',           'BMW',                  'https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=1200&auto=format&fit=crop', 150),
  ('lamborghini',   'Lamborghini',          'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?q=80&w=1200&auto=format&fit=crop', 160),
  ('ferrari',       'Ferrari',              'https://images.unsplash.com/photo-1592198084033-aade902d1aae?q=80&w=1200&auto=format&fit=crop', 170),
  ('mercedes',      'Mercedes-Benz',        'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?q=80&w=1200&auto=format&fit=crop', 180),
  ('audi',          'Audi',                 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?q=80&w=1200&auto=format&fit=crop', 190),
  -- VELORA-recommended additions -- not referenced by any existing listing
  -- yet, so these are genuinely new rows, not an upsert of existing data.
  ('force-motors',  'Force Motors',         'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?q=80&w=1200&auto=format&fit=crop', 200),
  ('citroen',       'Citroen',              'https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=1200&auto=format&fit=crop', 210),
  ('byd',           'BYD',                  'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?q=80&w=1200&auto=format&fit=crop', 220),
  ('volvo',         'Volvo',                'https://images.unsplash.com/photo-1590362891991-f776e747a588?q=80&w=1200&auto=format&fit=crop', 230),
  ('lexus',         'Lexus',                'https://images.unsplash.com/photo-1592198084033-aade902d1aae?q=80&w=1200&auto=format&fit=crop', 240),
  ('jaguar',        'Jaguar',               'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1200&auto=format&fit=crop', 250),
  ('land-rover',    'Land Rover',           'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?q=80&w=1200&auto=format&fit=crop', 260),
  ('porsche',       'Porsche',              'https://images.unsplash.com/photo-1553440569-bcc63803a83d?q=80&w=1200&auto=format&fit=crop', 270),
  ('aston-martin',  'Aston Martin',         'https://images.unsplash.com/photo-1602777624112-42a19caab449?q=80&w=1200&auto=format&fit=crop', 280),
  ('maserati',      'Maserati',             'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?q=80&w=1200&auto=format&fit=crop', 290),
  ('rolls-royce',   'Rolls-Royce',          'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=1200&auto=format&fit=crop', 300)
on conflict (id) do update set
  name = excluded.name,
  logo_url = excluded.logo_url,
  display_order = excluded.display_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. Seed: car_models -- ONLY for the 13 brands with a curated line-up in
--    src/data/carModels.ts today. Every other brand (including all 11 new
--    ones just seeded above) deliberately gets none, same "Add manually"
--    fallback the app already relies on for brands with no CAR_MODELS entry.
-- ---------------------------------------------------------------------------
insert into public.car_models (brand_id, name, body_type, fuel_type, transmission, seats, is_ev, is_hybrid, is_active, is_custom, display_order) values
  -- Maruti Suzuki
  ('maruti', 'Swift',      'Hatchback', 'Petrol', null, 5, false, false, true, false, 10),
  ('maruti', 'Baleno',     'Hatchback', 'Petrol', null, 5, false, false, true, false, 20),
  ('maruti', 'Dzire',      'Sedan',     'Petrol', null, 5, false, false, true, false, 30),
  ('maruti', 'Brezza',     'SUV',       'Petrol', null, 5, false, false, true, false, 40),
  ('maruti', 'Ertiga',     'MUV',       'Petrol', null, 7, false, false, true, false, 50),
  ('maruti', 'WagonR',     'Hatchback', 'Petrol', null, 5, false, false, true, false, 60),
  ('maruti', 'Fronx',      'SUV',       'Petrol', null, 5, false, false, true, false, 70),
  ('maruti', 'Alto K10',   'Hatchback', 'Petrol', null, 5, false, false, true, false, 80),
  -- Hyundai
  ('hyundai', 'i20',       'Hatchback', 'Petrol', null, 5, false, false, true, false, 10),
  ('hyundai', 'Creta',     'SUV',       'Petrol', null, 5, false, false, true, false, 20),
  ('hyundai', 'Venue',     'SUV',       'Petrol', null, 5, false, false, true, false, 30),
  ('hyundai', 'Verna',     'Sedan',     'Petrol', null, 5, false, false, true, false, 40),
  ('hyundai', 'Exter',     'SUV',       'Petrol', null, 5, false, false, true, false, 50),
  ('hyundai', 'Aura',      'Sedan',     'Petrol', null, 5, false, false, true, false, 60),
  -- Tata Motors
  ('tata', 'Nexon',        'SUV',       'Petrol', null, 5, false, false, true, false, 10),
  ('tata', 'Punch',        'SUV',       'Petrol', null, 5, false, false, true, false, 20),
  ('tata', 'Altroz',       'Hatchback', 'Petrol', null, 5, false, false, true, false, 30),
  ('tata', 'Tiago',        'Hatchback', 'Petrol', null, 5, false, false, true, false, 40),
  ('tata', 'Tigor',        'Sedan',     'Petrol', null, 5, false, false, true, false, 50),
  ('tata', 'Harrier',      'SUV',       'Diesel', null, 5, false, false, true, false, 60),
  ('tata', 'Safari',       'SUV',       'Diesel', null, 7, false, false, true, false, 70),
  -- Mahindra
  ('mahindra', 'Thar',       'SUV', 'Diesel', null, 4, false, false, true, false, 10),
  ('mahindra', 'XUV 3XO',    'SUV', 'Petrol', null, 5, false, false, true, false, 20),
  ('mahindra', 'XUV700',     'SUV', 'Diesel', null, 7, false, false, true, false, 30),
  ('mahindra', 'Scorpio-N',  'SUV', 'Diesel', null, 7, false, false, true, false, 40),
  ('mahindra', 'Bolero',     'SUV', 'Diesel', null, 7, false, false, true, false, 50),
  -- Toyota
  ('toyota', 'Glanza',                  'Hatchback', 'Petrol', null, 5, false, false, true, false, 10),
  ('toyota', 'Urban Cruiser Hyryder',   'SUV',       'Petrol', null, 5, false, true,  true, false, 20),
  ('toyota', 'Innova Crysta',           'MUV',       'Diesel', null, 7, false, false, true, false, 30),
  ('toyota', 'Innova HyCross',          'MUV',       'Petrol', null, 7, false, true,  true, false, 40),
  ('toyota', 'Fortuner',                'SUV',       'Diesel', null, 7, false, false, true, false, 50),
  -- Kia
  ('kia', 'Seltos', 'SUV', 'Petrol', null, 5, false, false, true, false, 10),
  ('kia', 'Sonet',  'SUV', 'Petrol', null, 5, false, false, true, false, 20),
  ('kia', 'Carens', 'MUV', 'Petrol', null, 6, false, false, true, false, 30),
  -- Honda
  ('honda', 'City',     'Sedan', 'Petrol', null, 5, false, false, true, false, 10),
  ('honda', 'Amaze',    'Sedan', 'Petrol', null, 5, false, false, true, false, 20),
  ('honda', 'Elevate',  'SUV',   'Petrol', null, 5, false, false, true, false, 30),
  -- Renault
  ('renault', 'Kwid',    'Hatchback', 'Petrol', null, 5, false, false, true, false, 10),
  ('renault', 'Triber',  'MUV',       'Petrol', null, 7, false, false, true, false, 20),
  ('renault', 'Kiger',   'SUV',       'Petrol', null, 5, false, false, true, false, 30),
  -- Nissan
  ('nissan', 'Magnite', 'SUV', 'Petrol', null, 5, false, false, true, false, 10),
  -- JSW MG Motor India
  ('mg', 'Astor',      'SUV',       'Petrol',   null, 5, false, false, true, false, 10),
  ('mg', 'Hector',     'SUV',       'Petrol',   null, null, false, false, true, false, 20),
  ('mg', 'Comet EV',   'Hatchback', 'Electric', null, 4, true,  false, true, false, 30),
  -- Volkswagen
  ('volkswagen', 'Virtus', 'Sedan', 'Petrol', null, 5, false, false, true, false, 10),
  ('volkswagen', 'Taigun', 'SUV',   'Petrol', null, 5, false, false, true, false, 20),
  -- Skoda
  ('skoda', 'Slavia',  'Sedan', 'Petrol', null, 5, false, false, true, false, 10),
  ('skoda', 'Kushaq',  'SUV',   'Petrol', null, 5, false, false, true, false, 20),
  -- Jeep
  ('jeep', 'Compass',  'SUV', 'Diesel', null, 5, false, false, true, false, 10),
  ('jeep', 'Meridian', 'SUV', 'Diesel', null, 7, false, false, true, false, 20)
on conflict (brand_id, name) where is_custom = false do update set
  body_type = excluded.body_type,
  fuel_type = excluded.fuel_type,
  seats = excluded.seats,
  is_ev = excluded.is_ev,
  is_hybrid = excluded.is_hybrid,
  display_order = excluded.display_order,
  updated_at = now();
