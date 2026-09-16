-- 0018_set_local_car_booking_hold_status_authorization.sql
-- SECURITY FIX -- set_local_car_booking_hold_status(p_booking_id, p_status)
-- had no caller authorization at all: any authenticated user could pass any
-- p_booking_id and flip that hold's status (cancelled/upcoming/etc.),
-- desyncing another user's booking from its own inventory hold. Based on
-- the actual live function body (verified, not guessed):
--
--   CREATE OR REPLACE FUNCTION public.set_local_car_booking_hold_status(
--     p_booking_id text, p_status text
--   ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path TO 'public', 'pg_temp'
--   AS $function$
--   begin
--     if p_booking_id is null or length(trim(p_booking_id)) = 0 then
--       raise exception 'A booking id is required.';
--     end if;
--     update public.local_car_inventory_holds
--       set status = p_status
--       where id = p_booking_id;
--   end;
--   $function$;
--
-- WHAT THIS DOES
--   Preserves the exact existing booking-id validation (same message) and
--   the exact existing UPDATE statement, unchanged. Inserts one
--   authorization block between them:
--     - auth.uid() must not be null.
--     - a hold row with id = p_booking_id must exist (local_car_inventory_holds.id
--       IS the booking id -- confirmed live schema: id, local_car_id,
--       renter_id, pickup_date, dropoff_date, status, created_at -- so this
--       single lookup also satisfies "the hold must correspond to the
--       booking identified by that same id", since they are the same value).
--     - the caller must be an authorized participant: either the hold's own
--       renter_id, or the owner of that hold's car (looked up via
--       local_car_inventory.local_car_id/owner_id -- local_car_inventory_holds
--       itself has no owner_id column, confirmed live schema: local_car_id,
--       quantity, updated_at, owner_id).
--   An unrelated authenticated user is now rejected instead of silently
--   succeeding.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch sync_local_car_inventory, create_local_car_booking_hold,
--   local_car_inventory, local_car_inventory_holds' schema, or any
--   booking/RLS policy. Does not change p_status handling, the update
--   target, or the function's signature/return type/language/security
--   mode/search_path.
--
-- NOT YET APPLIED TO PRODUCTION -- this execution environment has no
-- Supabase CLI, no linked project, and no database credentials, so this
-- migration could not be run here. Apply via the Supabase SQL editor or
-- `supabase db push`.
--
-- Safe to re-run: create-or-replace.

CREATE OR REPLACE FUNCTION public.set_local_car_booking_hold_status(
  p_booking_id text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hold record;
begin
  if p_booking_id is null or length(trim(p_booking_id)) = 0 then
    raise exception 'A booking id is required.';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select h.id, h.local_car_id, h.renter_id
    into v_hold
    from public.local_car_inventory_holds h
    where h.id = p_booking_id;

  if not found then
    raise exception 'No matching booking hold was found.';
  end if;

  if v_hold.renter_id <> auth.uid()
     and not exists (
       select 1
       from public.local_car_inventory inv
       where inv.local_car_id = v_hold.local_car_id
         and inv.owner_id = auth.uid()
     )
  then
    raise exception 'You are not authorized to modify this booking hold.';
  end if;

  update public.local_car_inventory_holds
    set status = p_status
    where id = p_booking_id;
end;
$function$;
