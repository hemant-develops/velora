-- 0003_duration_pricing_km.sql
-- PHASE 2 -- Owner Duration Pricing + KM Mileage System.
--
-- *** REQUIRED before using this build's app code. ***
-- Unlike 0002_booking_duration.sql (which was optional), CarsContext.carToRow
-- now UNCONDITIONALLY includes every column this migration adds -- the same
-- always-send-null-when-unset pattern this file already used for
-- model_id/year/discount_percent when 0001_catalog_foundation.sql shipped.
-- That means EVERY car Save/Publish (add a new listing OR edit an existing
-- one) -- not only ones that actually use duration pricing or a KM policy --
-- will fail with a "column ... does not exist" error until this migration
-- has been run. Run this FIRST, before testing the owner "List a Car" /
-- "Edit Car" screen on this build.
--
-- WHAT THIS DOES
--   Adds nine new, nullable columns to the existing public.car_listings
--   table. Purely additive -- every existing row gets NULL in all nine,
--   which the app already treats as "this car still uses the flat
--   pricePerDay/driverPricePerDay x billable-days formula from Phase 1, and
--   the original hardcoded 300 km/day agreement text" -- see
--   src/utils/pricing.ts priceForDuration and RentalAgreementScreen's Fuel
--   & Mileage clause.
--
--   duration_hourly_rate       -- ₹/hour. Prices Custom-duration bookings
--                                  and is the fallback for any of the four
--                                  presets below the owner didn't fix a
--                                  price for.
--   duration_price_6h/12h/24h/48h -- optional fixed ₹ price for that preset.
--   enabled_duration_presets   -- integer[] subset of {6,12,24,48} this car
--                                  offers renters; NULL/empty means "all
--                                  four" (Phase 1's behavior).
--   mileage_policy             -- 'limited' or 'unlimited'; NULL keeps
--                                  showing the existing hardcoded
--                                  300 km/day clause text.
--   km_limit_per_day           -- only meaningful when mileage_policy is
--                                  'limited'.
--   extra_km_charge            -- ₹ per km over the limit, only meaningful
--                                  when mileage_policy is 'limited'.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - Does NOT touch local_car_inventory or any booking-hold RPC -- pricing
--     and mileage are display/charge concerns, never part of the
--     availability safety net.
--   - Does NOT retroactively reprice any existing booking -- Booking rows
--     already store their own frozen subtotal/total from when they were
--     created (see types/index.ts Booking), completely unaffected by any
--     later change to a car's pricing here.
--   - Does NOT enforce or meter actual KM usage at drop-off (no
--     odometer/telemetry integration exists in this app) -- this only
--     stores and displays the owner's stated policy/rate for both sides to
--     see before booking; charging for real excess mileage is out of scope
--     for this phase.
--
-- Safe to re-run: every clause below is add-if-not-exists / drop-then-add.
alter table public.car_listings
  add column if not exists duration_hourly_rate integer,
  add column if not exists duration_price_6h integer,
  add column if not exists duration_price_12h integer,
  add column if not exists duration_price_24h integer,
  add column if not exists duration_price_48h integer,
  add column if not exists enabled_duration_presets integer[],
  add column if not exists mileage_policy text,
  add column if not exists km_limit_per_day integer,
  add column if not exists extra_km_charge integer;

alter table public.car_listings drop constraint if exists car_listings_mileage_policy_check;
alter table public.car_listings add constraint car_listings_mileage_policy_check
  check (mileage_policy is null or mileage_policy in ('limited', 'unlimited'));

alter table public.car_listings drop constraint if exists car_listings_duration_prices_nonneg;
alter table public.car_listings add constraint car_listings_duration_prices_nonneg
  check (
    (duration_hourly_rate is null or duration_hourly_rate >= 0) and
    (duration_price_6h is null or duration_price_6h >= 0) and
    (duration_price_12h is null or duration_price_12h >= 0) and
    (duration_price_24h is null or duration_price_24h >= 0) and
    (duration_price_48h is null or duration_price_48h >= 0) and
    (km_limit_per_day is null or km_limit_per_day >= 0) and
    (extra_km_charge is null or extra_km_charge >= 0)
  );
