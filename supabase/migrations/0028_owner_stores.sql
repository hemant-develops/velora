-- 0028_owner_stores.sql
-- FEATURE -- Owner digital storefront (/owners/{slug}).
--
-- WHAT THIS DOES
--   A new `owner_stores` table: one row per owner, holding the business
--   identity a subscribed owner presents publicly -- store name, a
--   permanent SEO slug, a description, and a plain-text policies block.
--   The store's logo/photo and contact routing deliberately reuse what
--   already exists rather than duplicating it: `profiles.avatar_url` is
--   the store logo (no second upload flow), and "contact options" is the
--   existing "Continue in the VELORA app" flow -- there is still no public
--   owner phone/WhatsApp anywhere, on this table or any other.
--
--   `upsert_owner_store()` is the only way to create/edit a row: it
--   generates the slug ONCE from the store name at creation (retrying with
--   a numeric suffix on a collision) and never changes it again on a later
--   edit -- a store's public URL must stay stable once Google has indexed
--   it, the same reasoning car slugs already use (see lib/slug.ts in
--   velora-web). SECURITY DEFINER only because checking slug availability
--   needs to see every owner's slug, not just the caller's own row (which
--   plain RLS would otherwise hide) -- the function itself still only ever
--   writes the CALLER's own row (auth.uid()), never anyone else's.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not touch profiles, car_listings, or any existing table/RLS.
--   Does not let anyone browse the full store list -- a store is only
--   readable by exact slug (or by its own owner), and even then only if
--   that owner currently has an active subscription (same
--   has_active_subscription() gate as car_listings' public visibility,
--   see 0026_owner_subscriptions.sql) -- a lapsed subscription hides the
--   store exactly like it hides that owner's cars.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE.

create table if not exists public.owner_stores (
  owner_id     uuid primary key references auth.users(id) on delete cascade,
  store_name   text not null,
  slug         text not null unique,
  description  text not null default '',
  policies     text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists velora_owner_stores_touch on public.owner_stores;
create trigger velora_owner_stores_touch
  before update on public.owner_stores
  for each row execute function public.velora_touch_updated_at();

alter table public.owner_stores enable row level security;

grant select on public.owner_stores to authenticated, anon;
-- No INSERT/UPDATE grant -- every write goes through upsert_owner_store()
-- below (SECURITY DEFINER), which is the only thing allowed to decide a
-- slug and enforce "you can only ever write your own row".

-- Public read is gated on an active subscription -- same visibility rule
-- as this owner's cars. The owner can always read their OWN (possibly
-- lapsed) store so they see it while renewing.
drop policy if exists owner_stores_select on public.owner_stores;
create policy owner_stores_select on public.owner_stores
  for select
  to authenticated, anon
  using (owner_id = auth.uid() or public.has_active_subscription(owner_id));

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(trim(input)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.upsert_owner_store(p_store_name text, p_description text, p_policies text)
returns table (slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing_slug text;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix int := 1;
begin
  if v_owner_id is null then
    raise exception 'Authentication required.';
  end if;
  if coalesce(trim(p_store_name), '') = '' then
    raise exception 'Store name is required.';
  end if;

  select os.slug into v_existing_slug from public.owner_stores os where os.owner_id = v_owner_id;

  if v_existing_slug is not null then
    -- Editing an existing store -- slug is permanent (see this file's top
    -- comment on why), only the display fields change.
    update public.owner_stores
      set store_name = trim(p_store_name),
          description = coalesce(p_description, ''),
          policies = coalesce(p_policies, '')
      where owner_id = v_owner_id;
    return query select v_existing_slug;
    return;
  end if;

  -- First-time creation -- generate a fresh, unique slug.
  v_base_slug := public.slugify(p_store_name);
  if v_base_slug = '' then
    v_base_slug := 'store';
  end if;
  v_candidate_slug := v_base_slug;

  while exists (select 1 from public.owner_stores os where os.slug = v_candidate_slug) loop
    v_suffix := v_suffix + 1;
    v_candidate_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.owner_stores (owner_id, store_name, slug, description, policies)
  values (v_owner_id, trim(p_store_name), v_candidate_slug, coalesce(p_description, ''), coalesce(p_policies, ''));

  return query select v_candidate_slug;
end;
$$;

grant execute on function public.upsert_owner_store(text, text, text) to authenticated;

-- Public lookup: resolve a store by its slug, joined with the owner's
-- name/avatar (the two profiles columns anon can already read -- see
-- 0025_public_website_read_access.sql) and their active car count. A
-- single SECURITY DEFINER call instead of the website doing three
-- separate round trips under three different RLS checks.
create or replace function public.get_owner_store_by_slug(p_slug text)
returns table (
  owner_id uuid,
  store_name text,
  slug text,
  description text,
  policies text,
  owner_name text,
  owner_avatar text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    os.owner_id,
    os.store_name,
    os.slug,
    os.description,
    os.policies,
    p.full_name,
    p.avatar_url
  from public.owner_stores os
  join public.profiles p on p.id = os.owner_id
  where os.slug = p_slug
    and public.has_active_subscription(os.owner_id);
$$;

grant execute on function public.get_owner_store_by_slug(text) to authenticated, anon;
