-- 0023_account_deletion.sql
-- FEATURE -- Real, working "Delete Account".
--
-- WHAT THIS DOES
--   Profile's own "Delete Account" action used to only sign the person out
--   and ask them to email support -- deliberately, since actually erasing an
--   auth.users row needs the Supabase Admin API (service-role only, callable
--   from an Edge Function, not from plain SQL/RLS), which this app doesn't
--   have deployed. The confirmed bug this closes is different and doesn't
--   need that Admin API at all: after "deleting", the SAME email/password
--   could log straight back in as if nothing had happened, because nothing
--   server-side ever recorded that this account had been deleted.
--
--   Adds `profiles.deleted_at` (nullable) and a `deactivate_own_account()`
--   SECURITY DEFINER RPC that any signed-in user can call ONLY on their own
--   row (uses auth.uid() directly, takes no target-user parameter) to set
--   it and best-effort-scrub their own display name/avatar/bio-bearing
--   columns. AuthContext.loadUserFromSession (app-side change, same PR)
--   checks this on every session load/restore and immediately force-signs-
--   out any session whose profile has deleted_at set, before that user ever
--   reaches the authenticated app -- so the account genuinely can no longer
--   be used, even though auth.users itself still has the row.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not delete the auth.users row, or any bookings/reviews/car
--   listings/messages this account is a party to -- removing those rows
--   would break RLS ownership and referential integrity for every OTHER
--   user who has a real, legitimate relationship to them (e.g. a
--   completed booking's other party, a car currently mid-rental). A true
--   "erase everything" is what the existing support-email path
--   (utils/policy.ts's Privacy Policy text) already commits to handling
--   manually, and stays the process for that. Does not touch RLS on any
--   table other than adding this one new policy-free RPC -- every existing
--   SELECT/UPDATE policy on `profiles` is untouched.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / CREATE OR REPLACE.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create or replace function public.deactivate_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  update public.profiles
    set deleted_at = now(),
        full_name = 'Deleted User',
        avatar_url = null
    where id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.deactivate_own_account() to authenticated;
