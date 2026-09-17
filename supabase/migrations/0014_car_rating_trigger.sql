-- 0014_car_rating_trigger.sql
-- BUG FIX -- CarsContext.updateCarRating() runs client-side and calls
-- `.from('car_listings').update({rating, review_count})` as whoever
-- submitted the review. But car_listings_update RLS only allows
-- `owner_id = auth.uid()` -- a renter (who is never the car's owner)
-- submitting a review therefore has this UPDATE silently rejected by RLS
-- (0 rows affected, no thrown error), so the new rating only ever shows
-- optimistically on the submitting device and never actually persists.
--
-- WHAT THIS DOES
--   Adds a SECURITY DEFINER trigger on reviews that recomputes
--   car_listings.rating/review_count from all reviews for that car,
--   authoritatively, regardless of who submitted the triggering review --
--   the same "runs with elevated privilege, bypassing the owner-only RLS
--   for this one derived, system-computed field" pattern already used by
--   velora_bump_conversation_on_message and the referral/wallet triggers
--   elsewhere in this schema.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not change car_listings_update RLS (owners still can't have their
--   listing's rating manipulated by a direct client update -- only this
--   trigger, running as the function owner, can write rating/review_count).
--   Does not remove the existing client-side updateCarRating() call in
--   CarsContext.tsx -- leaving it in place is harmless (it will keep
--   failing silently for renters exactly as before, now redundant rather
--   than load-bearing); removing it is an optional follow-up cleanup, not
--   required for this fix to work.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: create-or-replace function, drop-then-create trigger.

create or replace function public.velora_refresh_car_rating()
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
    from public.reviews
    where car_id = new.car_id;

  update public.car_listings
    set rating = coalesce(round(v_avg, 2), 0),
        review_count = coalesce(v_count, 0)
    where id = new.car_id;

  return new;
end;
$$;

drop trigger if exists velora_reviews_refresh_car_rating on public.reviews;
create trigger velora_reviews_refresh_car_rating
  after insert on public.reviews
  for each row
  execute function public.velora_refresh_car_rating();
