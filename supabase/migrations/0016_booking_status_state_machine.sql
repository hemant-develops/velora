-- 0016_booking_status_state_machine.sql
-- SECURITY FIX -- bookings.status transitions were enforced only in client
-- code (BookingsContext.VALID_TRANSITIONS / canTransition, src/context/BookingsContext.tsx:43-52).
-- The database CHECK constraint on `status` only restricts which VALUES are
-- legal, never which transitions between them are legal. A participant
-- could PATCH status directly to 'completed' via the Supabase REST API,
-- which triggers a real 150-credit referral wallet payout
-- (velora_award_referral_completion_bonus) with no eligibility check.
--
-- WHAT THIS DOES
--   Adds a BEFORE UPDATE trigger on bookings that enforces the EXACT same
--   state machine already implemented client-side, so no legitimate app
--   flow is affected -- only a transition the app itself would never
--   attempt becomes impossible:
--     pending   -> upcoming, rejected, cancelled
--     upcoming  -> active, cancelled
--     active    -> completed
--     completed, cancelled, rejected -> (terminal, no further transition)
--   Setting status to its current value (a no-op write) is always allowed.
--   Updates that don't touch `status` at all are never affected.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch price, payment, or date fields -- those remain a
--   separate, larger piece of work (see the payment/booking trust-model
--   investigation) that requires a real payment gateway to be designed
--   around first, not a quick constraint.
--   Does not touch INSERT (the initial status on booking creation is set
--   directly by the app, not a transition from anything).
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: create-or-replace function, drop-then-create trigger.

create or replace function public.velora_enforce_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status in ('upcoming', 'rejected', 'cancelled') then
    return new;
  end if;

  if old.status = 'upcoming' and new.status in ('active', 'cancelled') then
    return new;
  end if;

  if old.status = 'active' and new.status = 'completed' then
    return new;
  end if;

  raise exception 'Illegal booking status transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists velora_bookings_status_transition on public.bookings;
create trigger velora_bookings_status_transition
  before update on public.bookings
  for each row
  execute function public.velora_enforce_booking_status_transition();
