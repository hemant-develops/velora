-- 0021_phone_identity_binding.sql
-- FEATURE -- Phone Identity Binding + Duplicate Phone Protection.
--
-- WHAT THIS DOES
--   A new, self-contained `phone_identities` table records, per account,
--   the ONE Supabase-Auth-verified phone number bound to it. "Verified"
--   here means auth.users.phone_confirmed_at is actually set for that
--   user -- this table never trusts a client-supplied phone string, it
--   only ever records what Supabase Auth itself already confirmed via a
--   real OTP (either the phone-login flow, sendPhoneOtp/verifyPhoneOtp --
--   already implemented -- or the new phone-binding flow for an existing
--   email/Google session, sendPhoneBindOtp/verifyPhoneBindOtp, which use
--   supabase.auth.updateUser({phone}) + verifyOtp({type:'phone_change'})).
--
--   A UNIQUE constraint on `phone` is the actual, database-level
--   duplicate-phone prevention: a second account attempting to bind a
--   phone already bound to a different account is rejected by Postgres
--   itself, not merely by a client-side check.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch `profiles`, `owner_verifications` (0020, untouched --
--   government-ID verification is a separate concern), bookings,
--   inventory, or any existing RLS/RPC. Does not store any OTP -- OTPs are
--   generated, sent, and checked entirely by Supabase Auth/Twilio; this
--   migration only records the RESULT (a confirmed phone) after the fact.
--   Does not store or touch any payment credential of any kind.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: create-if-not-exists / drop-then-create policies /
-- create-or-replace functions.

create table if not exists public.phone_identities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  phone        text not null unique,
  verified_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.phone_identities enable row level security;

drop policy if exists phone_identities_select_own on public.phone_identities;
create policy phone_identities_select_own on public.phone_identities
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No direct INSERT/UPDATE/DELETE grant for anyone -- every write goes
-- through bind_phone_identity() below, which is the only thing allowed to
-- decide "this phone is now verified for this user", based on Supabase
-- Auth's own confirmation, never a client-supplied claim.

-- Reads the CALLER's own confirmed phone directly from auth.users (never
-- trusts a parameter) and records/updates the binding. Idempotent: calling
-- it again with the same already-bound phone is a harmless no-op success.
-- Rebinding to a NEW confirmed phone (a person's number legitimately
-- changed) is allowed for their OWN row; binding a phone already owned by
-- a DIFFERENT account is rejected by the unique constraint on `phone`.
create or replace function public.bind_phone_identity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_confirmed_at timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select phone, phone_confirmed_at into v_phone, v_confirmed_at
    from auth.users
    where id = auth.uid();

  if v_phone is null or v_confirmed_at is null then
    return jsonb_build_object('success', false, 'error', 'No verified phone number found on this account yet.');
  end if;

  begin
    insert into public.phone_identities (user_id, phone, verified_at)
    values (auth.uid(), v_phone, v_confirmed_at)
    on conflict (user_id) do update
      set phone = excluded.phone,
          verified_at = excluded.verified_at;
  exception
    when unique_violation then
      return jsonb_build_object('success', false, 'error', 'This phone number is already linked to another VELORA account.');
  end;

  return jsonb_build_object('success', true, 'phone', v_phone);
end;
$$;

grant execute on function public.bind_phone_identity() to authenticated;
