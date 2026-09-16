-- 0019_admin_app_connect.sql
-- FEATURE -- connects three admin panel sections to the mobile app. Per
-- 0004_admin_phase3.sql's own header: "Every table here is admin-owned:
-- nothing on the mobile app reads or writes these yet" -- their RLS is a
-- single `for all to authenticated using (public.is_admin())` policy, which
-- means a non-admin renter/owner session gets ZERO rows even trying to
-- read them. That is the actual reason admin changes to Featured Listings,
-- Ads, and Promo Codes have never shown up in the app.
--
-- WHAT THIS DOES
--   1. Adds a second, additive SELECT policy (Postgres OR's multiple
--      permissive policies for the same command) letting any authenticated
--      app user read only ACTIVE, currently-in-window rows of
--      featured_listings and ads -- admins keep full access via their
--      existing policy, unchanged.
--   2. Adds the same kind of active-only SELECT policy for promo_codes as
--      #1 (OffersScreen.tsx already exists in the app specifically to list
--      codes for people to use -- a promo code is meant to be publicized,
--      unlike an admin table like owner_payouts). Inactive/expired/future
--      codes and internal fields like used_count are still not exposed
--      beyond what that policy naturally allows to be read. On top of that,
--      adds two SECURITY DEFINER RPCs for the actual checkout flow:
--        - validate_promo_code(p_code, p_subtotal): read-only, safe to call
--          on every keystroke while previewing a discount in the app.
--        - redeem_promo_code(p_code): increments used_count by 1, meant to
--          be called once, at the moment a booking is actually created.
--      Neither RPC ever returns another code's existence/details -- only
--      whether THE SUPPLIED code is valid.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch campaigns, app_settings, or owner_payouts -- these stay
--   admin-only by design (internal orchestration/config/ledger, no
--   consumer-facing equivalent). Does not touch bookings' schema or RLS.
--   Does not touch create_local_car_booking_hold, sync_local_car_inventory,
--   or set_local_car_booking_hold_status.
--
-- NOT YET APPLIED TO PRODUCTION -- this environment has no Supabase CLI or
-- credentials. Apply via the Supabase SQL editor or `supabase db push`.
--
-- Safe to re-run: drop-then-create policies, create-or-replace functions.

drop policy if exists featured_listings_select_active on public.featured_listings;
create policy featured_listings_select_active on public.featured_listings
  for select to authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists ads_select_active on public.ads;
create policy ads_select_active on public.ads
  for select to authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists promo_codes_select_active on public.promo_codes;
create policy promo_codes_select_active on public.promo_codes
  for select to authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now())
    and (max_uses is null or used_count < max_uses)
  );

create or replace function public.validate_promo_code(p_code text, p_subtotal numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo record;
  v_discount numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'You need to be signed in to apply a promo code.');
  end if;

  select id, code, discount_type, discount_value, max_uses, used_count, starts_at, expires_at, is_active
    into v_promo
    from public.promo_codes
    where upper(code) = upper(trim(coalesce(p_code, '')));

  if not found then
    return jsonb_build_object('success', false, 'error', 'That promo code isn''t valid.');
  end if;

  if not v_promo.is_active then
    return jsonb_build_object('success', false, 'error', 'That promo code is no longer active.');
  end if;

  if v_promo.starts_at is not null and now() < v_promo.starts_at then
    return jsonb_build_object('success', false, 'error', 'That promo code isn''t active yet.');
  end if;

  if v_promo.expires_at is not null and now() > v_promo.expires_at then
    return jsonb_build_object('success', false, 'error', 'That promo code has expired.');
  end if;

  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then
    return jsonb_build_object('success', false, 'error', 'That promo code has reached its usage limit.');
  end if;

  if p_subtotal is null then
    return jsonb_build_object(
      'success', true,
      'code', v_promo.code,
      'discount_type', v_promo.discount_type,
      'discount_value', v_promo.discount_value
    );
  end if;

  if v_promo.discount_type = 'percent' then
    v_discount := round(p_subtotal * v_promo.discount_value / 100);
  else
    v_discount := v_promo.discount_value;
  end if;
  v_discount := least(greatest(v_discount, 0), p_subtotal);

  return jsonb_build_object('success', true, 'code', v_promo.code, 'discount', v_discount);
end;
$$;

grant execute on function public.validate_promo_code(text, numeric) to authenticated;

create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  update public.promo_codes
    set used_count = used_count + 1
    where upper(code) = upper(trim(coalesce(p_code, '')))
      and is_active = true
      and (max_uses is null or used_count < max_uses)
    returning 1 into v_updated;

  if v_updated is null then
    return jsonb_build_object('success', false, 'error', 'That promo code could not be redeemed.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.redeem_promo_code(text) to authenticated;
