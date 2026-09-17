-- 0027_subscription_plans.sql
-- FEATURE -- Configurable subscription pricing.
--
-- WHAT THIS DOES
--   0026_owner_subscriptions.sql's Edge Functions originally had the ₹1/
--   3-month price hardcoded as a constant. This moves it into a real table
--   so changing the price later (₹199, ₹499, ...) is a data change made
--   from the Supabase dashboard, never an app/website code change or a
--   redeploy of anything. Both create-subscription-order and
--   verify-subscription-payment (same PR) now read the active plan from
--   here -- the amount a client's browser/app displays is cosmetic; the
--   amount actually charged and verified always comes from this table,
--   server-side, so a plan price change takes effect everywhere at once
--   and can never be spoofed by a stale client passing an old amount.
--
--   Adds `owner_subscriptions.plan_id` (nullable FK) so each purchase
--   records exactly which plan it paid for, and seeds the current
--   introductory plan: ₹1 for 90 days ("3 months").
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not implement Razorpay recurring billing/plans -- this table is
--   VELORA's own pricing catalog, unrelated to Razorpay's separate
--   "Plans" API. Does not let any authenticated client write to it --
--   only public.is_admin() (same admin-only write pattern as `brands`) can
--   add/change a plan; every other role only ever reads.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS /
-- ON CONFLICT upsert.

create table if not exists public.subscription_plans (
  id             text primary key,
  name           text not null,
  price_paise    integer not null check (price_paise > 0),
  duration_days  integer not null check (duration_days > 0),
  is_active      boolean not null default true,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;

-- Pricing is not sensitive -- both the app and the signed-out public
-- website need to display and purchase the current plan.
grant select on public.subscription_plans to authenticated, anon;

drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans
  for select
  to authenticated, anon
  using (is_active = true or public.is_admin());

drop policy if exists subscription_plans_admin_write on public.subscription_plans;
create policy subscription_plans_admin_write on public.subscription_plans
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.subscription_plans (id, name, price_paise, duration_days, is_active, display_order) values
  ('owner-intro', 'VELORA Owner Plan', 100, 90, true, 10)
on conflict (id) do nothing;

-- Records which plan a purchase actually paid for. Nullable because it's
-- set going forward only -- a hypothetical pre-existing row from before
-- this column existed simply has no plan reference, same "additive,
-- backfill-free" pattern every other migration in this project uses.
alter table public.owner_subscriptions
  add column if not exists plan_id text references public.subscription_plans(id);
