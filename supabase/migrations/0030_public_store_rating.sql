-- 0030_public_store_rating.sql
-- Extend the public store lookup with the aggregate maintained by
-- 0029_two_way_reviews. Raw owner review rows remain authenticated-only.

drop function if exists public.get_owner_store_by_slug(text);

create or replace function public.get_owner_store_by_slug(p_slug text)
returns table (
  owner_id uuid,
  store_name text,
  slug text,
  description text,
  policies text,
  owner_name text,
  owner_avatar text,
  rating numeric,
  review_count integer
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
    p.avatar_url,
    os.rating,
    os.review_count
  from public.owner_stores os
  join public.profiles p on p.id = os.owner_id
  where os.slug = p_slug
    and public.has_active_subscription(os.owner_id);
$$;

grant execute on function public.get_owner_store_by_slug(text) to authenticated, anon;