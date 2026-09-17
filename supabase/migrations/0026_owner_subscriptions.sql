-- 0026_owner_subscriptions.sql
-- FEATURE -- Subscription-based owner monetization (replaces the
-- never-actually-built "rental commission" idea -- a codebase-wide search
-- found no commission-charging code anywhere; the word only ever appeared
-- in one comment explaining a chat-safety feature's motivation, so there
-- was nothing to remove. This is a pure addition).
--
-- WHAT THIS DOES
--   A new `owner_subscriptions` table: one row per owner per purchase,
--   recording a REAL Razorpay payment (order id, payment id, amount) and
--   the validity window it bought (`started_at` -> `expires_at`). This is
--   the single source of truth both the mobile app and the public website
--   check before letting someone list/keep a car active -- "Subscription
--   Active -> Car Listing Active -> Website + App visible" from the
--   product spec.
--
--   Nobody -- not the app, not the website, not any authenticated client --
--   can write to this table directly (no INSERT/UPDATE grant at all). The
--   only way a row is ever created is the verify-subscription-payment Edge
--   Function (service-role, see that function's own comment) after it has
--   independently recomputed and verified the Razorpay payment signature
--   server-side. A client claiming "I paid" is never trusted on its own --
--   exactly the same non-negotiable rule real money changing hands
--   requires, and the same shape as every other privileged write in this
--   project (bind_phone_identity, deactivate_own_account, ...).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch car_listings, its RLS, or any existing table. Gating
--   "can this owner list/keep a car active" on an active subscription is
--   enforced at the APP layer for this first pass (OwnerAddCarScreen), not
--   with a new car_listings RLS/CHECK constraint -- the safer, smaller
--   change while this whole flow is brand new and unproven; a DB-level gate
--   can be layered on once real subscriptions are flowing correctly. Does
--   not implement Razorpay's recurring "Subscriptions" API (auto-billing) --
--   this is a one-time ₹1 payment that buys a fixed 3-month window;
--   renewing after expiry is a new payment through the same flow. Does not
--   store any card/UPI/bank detail -- Razorpay Checkout collects that
--   directly with Razorpay, never this app.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS.

create table if not exists public.owner_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  razorpay_order_id   text not null,
  razorpay_payment_id text not null unique,
  amount_paise        integer not null,
  started_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

create index if not exists owner_subscriptions_owner_id_idx on public.owner_subscriptions (owner_id);

alter table public.owner_subscriptions enable row level security;

-- An owner can see their own subscription history/status. No INSERT/UPDATE/
-- DELETE grant to `authenticated` at all -- see this file's top comment for
-- why every write must go through the service-role Edge Function instead.
grant select on public.owner_subscriptions to authenticated;

drop policy if exists owner_subscriptions_select_own on public.owner_subscriptions;
create policy owner_subscriptions_select_own on public.owner_subscriptions
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Convenience read for both the app and the public website: "does this
-- owner currently have ANY unexpired, active subscription row" -- as a
-- single boolean, nothing else. Deliberately SECURITY DEFINER: the public
-- website calls this as `anon` (no session at all), and
-- owner_subscriptions_select_own above would otherwise block it from
-- seeing anything (auth.uid() is null for anon). This function is the
-- ONLY thing anon can ever learn about this table -- not the order id,
-- payment id, or amount of any row, just a computed true/false.
create or replace function public.has_active_subscription(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owner_subscriptions
    where owner_id = p_owner_id
      and status = 'active'
      and expires_at > now()
  );
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated, anon;

-- Batched counterpart of has_active_subscription() for a whole page of
-- cars at once (CarsContext on the app, searchActiveCars on the website) --
-- one round trip instead of one RPC call per unique owner on the page.
-- Same SECURITY DEFINER reasoning as above: callable by anon with no
-- session, and never exposes anything beyond "which of these ids currently
-- have an active subscription".
create or replace function public.get_active_subscription_owner_ids(p_owner_ids uuid[])
returns table (owner_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct os.owner_id
  from public.owner_subscriptions os
  where os.owner_id = any(p_owner_ids)
    and os.status = 'active'
    and os.expires_at > now();
$$;

grant execute on function public.get_active_subscription_owner_ids(uuid[]) to authenticated, anon;
