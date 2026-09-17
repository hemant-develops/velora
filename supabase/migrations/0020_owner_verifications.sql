-- 0020_owner_verifications.sql
-- FEATURE -- real, server-side owner identity verification, replacing the
-- current fake instant-approve flow (AuthContext.submitOwnerVerification
-- currently just flips a client-only flag after a 1.1s fake delay, and the
-- ID number/name/phone were only ever stored in on-device AsyncStorage --
-- never sent to Supabase, so verification didn't even survive a reinstall).
--
-- WHAT THIS DOES
--   1. A new, self-contained `owner_verifications` table -- does not touch
--      `profiles`, `car_listings`, `bookings`, or any existing table/RPC.
--   2. The raw government ID number is NEVER stored in plain text -- only
--      a sha256 hash (`id_number_hash`), computed server-side inside the
--      RPC below. The raw value exists only transiently as a function
--      parameter during that one call; it is never written to any column,
--      never logged, and never returned to any client.
--   3. A UNIQUE constraint on `id_number_hash` (partial: only enforced once
--      a hash exists) is the actual duplicate-identity prevention this was
--      asked for -- two different accounts submitting the same government
--      ID number is rejected by the database itself, not just a client
--      check.
--   4. The ID document photo goes into a PRIVATE storage bucket
--      (`owner-id-documents`) -- readable only by the uploader themselves
--      and admins (via a short-lived signed URL, never a public URL).
--   5. Two SECURITY DEFINER RPCs:
--        - submit_owner_verification(...): self-service submit/resubmit.
--          Blocks resubmission while a submission is already pending or
--          verified (only a rejected one may be resubmitted).
--        - review_owner_verification(...): admin-only (public.is_admin()),
--          approves or rejects a pending submission.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch profiles.role. Owner-mode UI gating in the app now
--   checks THIS table's real, server-verified status directly, instead of
--   relying on the pre-existing, still-unresolved profiles.role
--   self-service-write concern (a separate, larger fix tracked from the
--   earlier security audit) -- so this closes the "fake verification"
--   gap without needing to touch that unrelated, unverified table at all.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: create-if-not-exists / drop-then-create policies /
-- create-or-replace functions.

create extension if not exists pgcrypto;

create table if not exists public.owner_verifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users(id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  full_name         text not null,
  phone             text not null,
  id_type           text not null,
  id_number_hash    text,
  id_document_path  text,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id) on delete set null,
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Duplicate-identity prevention: the same government ID hash can only ever
-- belong to one row. Partial (WHERE id_number_hash is not null) so multiple
-- rows mid-migration/edge-cases with no hash yet don't collide on NULL.
create unique index if not exists owner_verifications_id_number_hash_uniq
  on public.owner_verifications (id_number_hash)
  where id_number_hash is not null;

alter table public.owner_verifications enable row level security;

drop policy if exists owner_verifications_select_own on public.owner_verifications;
create policy owner_verifications_select_own on public.owner_verifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No direct INSERT/UPDATE grant at all -- every write goes through the two
-- RPCs below (RPC-mediated writes, the same pattern already used
-- throughout this schema for notifications/wallet/bookings-hold-adjacent
-- tables), so the hash computation and admin-only review can't be
-- bypassed by a raw client insert/update.

create or replace function public.velora_touch_owner_verification_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists velora_owner_verifications_touch on public.owner_verifications;
create trigger velora_owner_verifications_touch
  before update on public.owner_verifications
  for each row
  execute function public.velora_touch_owner_verification_updated_at();

-- Private storage bucket for the actual ID document image.
insert into storage.buckets (id, name, public)
values ('owner-id-documents', 'owner-id-documents', false)
on conflict (id) do nothing;

drop policy if exists owner_id_documents_own_write on storage.objects;
create policy owner_id_documents_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'owner-id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists owner_id_documents_own_read on storage.objects;
create policy owner_id_documents_own_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'owner-id-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Self-service submit/resubmit. Computes the id-number hash server-side;
-- the raw id_number parameter is never persisted anywhere.
create or replace function public.submit_owner_verification(
  p_full_name text,
  p_phone text,
  p_id_type text,
  p_id_number text,
  p_id_document_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_has_existing boolean;
  v_hash text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_phone), '') = '' or coalesce(trim(p_id_number), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Full name, phone, and ID number are required.');
  end if;

  select * into v_existing from public.owner_verifications where user_id = auth.uid();
  v_has_existing := found;

  if v_has_existing and v_existing.status in ('pending', 'verified') then
    return jsonb_build_object('success', false, 'error', 'A verification is already pending or approved for this account.');
  end if;

  v_hash := encode(digest(lower(trim(p_id_number)), 'sha256'), 'hex');

  if exists (
    select 1 from public.owner_verifications
    where id_number_hash = v_hash and user_id <> auth.uid()
  ) then
    return jsonb_build_object('success', false, 'error', 'This ID is already linked to another VELORA account.');
  end if;

  if v_has_existing then
    update public.owner_verifications
      set full_name = trim(p_full_name),
          phone = trim(p_phone),
          id_type = p_id_type,
          id_number_hash = v_hash,
          id_document_path = p_id_document_path,
          status = 'pending',
          submitted_at = now(),
          reviewed_at = null,
          reviewed_by = null,
          rejection_reason = null
      where user_id = auth.uid();
  else
    insert into public.owner_verifications (
      user_id, full_name, phone, id_type, id_number_hash, id_document_path
    ) values (
      auth.uid(), trim(p_full_name), trim(p_phone), p_id_type, v_hash, p_id_document_path
    );
  end if;

  return jsonb_build_object('success', true);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'This ID is already linked to another VELORA account.');
end;
$$;

grant execute on function public.submit_owner_verification(text, text, text, text, text) to authenticated;

-- Admin-only review action.
create or replace function public.review_owner_verification(
  p_user_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    return jsonb_build_object('success', false, 'error', 'Admin access required.');
  end if;

  update public.owner_verifications
    set status = case when p_approve then 'verified' else 'rejected' end,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        rejection_reason = case when p_approve then null else p_rejection_reason end
    where user_id = p_user_id
      and status = 'pending';

  if not found then
    return jsonb_build_object('success', false, 'error', 'No pending verification found for this user.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.review_owner_verification(uuid, boolean, text) to authenticated;
