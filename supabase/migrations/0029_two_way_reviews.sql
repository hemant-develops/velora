-- 0029_two_way_reviews.sql
-- FEATURE -- Two-way review system (Customer -> Owner/Store, Owner ->
-- Customer), alongside the existing Customer -> Car reviews (`reviews`
-- table, unchanged).
--
-- WHAT THIS DOES
--   Two new tables, each following the EXACT same "genuine completed
--   interaction only" shape 0013_reviews_completed_booking_check.sql
--   already established for car reviews -- a review can only be inserted
--   if it references a real `bookings` row with status = 'completed' where
--   the caller is the correct party (renter or owner) and the target
--   matches that same booking. `booking_id unique` on each table is what
--   prevents a duplicate review for the same booking (one review per
--   booking per direction, exactly like the existing reviews table).
--
--   1. owner_reviews (Customer -> Owner/Store): reviewer is the renter,
--      target is the owner. A trigger (mirroring
--      0014_car_rating_trigger.sql's velora_refresh_car_rating exactly)
--      keeps owner_stores.rating/review_count authoritative regardless of
--      who submitted the triggering review -- the public store page shows
--      this aggregate, the same "aggregate only, not raw review rows"
--      pattern the website already uses for car ratings (reviews itself
--      has never been anon-readable either).
--
--   2. customer_reviews (Owner -> Customer): reviewer is the owner, target
--      is the renter. Customers have no public profile/store anywhere in
--      this product, so this is deliberately NOT surfaced on the public
--      website at all -- it's a private trust record the reviewed
--      customer can read about themselves, and the reviewing owner can
--      read their own submission.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch the existing `reviews` table (Customer -> Car) or its
--   RLS/trigger in any way. Does not grant anon SELECT on either new
--   table -- exactly like `reviews`, individual review rows/comments stay
--   authenticated-only; only the owner_stores aggregate is public. Does
--   not allow editing or deleting a submitted review (matches `reviews`,
--   which also has no update/delete policy) -- a genuine review of a
--   genuine completed interaction is a permanent record.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. owner_reviews -- Customer -> Owner/Store
-- ---------------------------------------------------------------------------
create table if not exists public.owner_reviews (
  id           text primary key,
  booking_id   text not null unique,
  reviewer_id  uuid not null references auth.users(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists owner_reviews_owner_id_idx on public.owner_reviews (owner_id);

alter table public.owner_reviews enable row level security;

grant select, insert on public.owner_reviews to authenticated;

drop policy if exists owner_reviews_select on public.owner_reviews;
create policy owner_reviews_select on public.owner_reviews
  for select to authenticated
  using (true);

drop policy if exists owner_reviews_insert on public.owner_reviews;
create policy owner_reviews_insert on public.owner_reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.renter_id = auth.uid()
        and b.owner_id = owner_id
        and b.status = 'completed'
    )
  );

-- owner_stores aggregate -- same reasoning as
-- 0014_car_rating_trigger.sql: a renter submitting this review is never
-- the owner, so a direct client UPDATE on owner_stores would be silently
-- rejected by its own RLS; this trigger runs with elevated privilege
-- specifically to keep the aggregate authoritative regardless of who
-- triggered it.
alter table public.owner_stores
  add column if not exists rating numeric not null default 0,
  add column if not exists review_count integer not null default 0;

create or replace function public.velora_refresh_owner_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_count integer;
begin
  select avg(rating)::numeric, count(*)
    into v_avg, v_count
    from public.owner_reviews
    where owner_id = new.owner_id;

  update public.owner_stores
    set rating = coalesce(round(v_avg, 2), 0),
        review_count = coalesce(v_count, 0)
    where owner_id = new.owner_id;

  return new;
end;
$$;

drop trigger if exists velora_owner_reviews_refresh_rating on public.owner_reviews;
create trigger velora_owner_reviews_refresh_rating
  after insert on public.owner_reviews
  for each row
  execute function public.velora_refresh_owner_rating();

-- ---------------------------------------------------------------------------
-- 2. customer_reviews -- Owner -> Customer (private, no public exposure)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_reviews (
  id           text primary key,
  booking_id   text not null unique,
  reviewer_id  uuid not null references auth.users(id) on delete cascade,
  customer_id  uuid not null references auth.users(id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists customer_reviews_customer_id_idx on public.customer_reviews (customer_id);

alter table public.customer_reviews enable row level security;

grant select, insert on public.customer_reviews to authenticated;

-- The reviewed customer can see reviews about themselves; the reviewing
-- owner can see their own submissions. Nobody else (no public/anon access
-- at all -- see this file's top comment on why).
drop policy if exists customer_reviews_select on public.customer_reviews;
create policy customer_reviews_select on public.customer_reviews
  for select to authenticated
  using (customer_id = auth.uid() or reviewer_id = auth.uid() or public.is_admin());

drop policy if exists customer_reviews_insert on public.customer_reviews;
create policy customer_reviews_insert on public.customer_reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.owner_id = auth.uid()
        and b.renter_id = customer_id
        and b.status = 'completed'
    )
  );
