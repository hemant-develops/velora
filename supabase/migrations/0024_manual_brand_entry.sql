-- 0024_manual_brand_entry.sql
-- FEATURE -- "Can't find your brand? Add manually" (mirrors car_models).
--
-- WHAT THIS DOES
--   0001_catalog_foundation.sql already gave car_models an owner-writable
--   "Add manually" escape hatch (is_custom/created_by, a pending row only
--   the submitting owner can see until admin review) for when the curated
--   MODEL list doesn't have what they're listing -- but `brands` never got
--   the same escape hatch. If a car's actual brand isn't in the seeded
--   catalog (or the catalog table is empty/not yet seeded on a given
--   environment), the owner has NO way at all to list their car -- the
--   Brand chip row simply has nothing to select, and there's no manual
--   fallback like Model already has. This closes that gap the same way:
--   `brands.is_custom` / `brands.created_by`, an insert policy that only
--   ever allows a PENDING (is_active = false) row attributed to the
--   inserting owner, and a select policy update so that pending row is
--   visible to its own creator (for their own listing wizard) without
--   being visible to anyone else until an admin reviews and activates it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not let an owner insert (or ever have inserted) an
--   already-active/canonical brand row -- `with check` below hard-requires
--   is_custom = true and is_active = false, identical in shape to
--   car_models_insert_custom. Does not touch the existing curated brand
--   seed data, car_models, or any other table's RLS.
--
-- NOT YET APPLIED TO PRODUCTION. Created for review per project workflow
-- rules.
--
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS.

alter table public.brands
  add column if not exists is_custom boolean not null default false,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Replaces the old "every signed-in user sees every row" policy with the
-- same shape car_models_select already uses: the reviewed/active catalog
-- for everyone, plus an owner's own still-pending submission.
drop policy if exists brands_select_authenticated on public.brands;
create policy brands_select_authenticated
  on public.brands
  for select
  to authenticated
  using (is_active = true or created_by = auth.uid());

-- An owner may insert ONLY a pending custom row attributed to themselves --
-- never a directly-active/canonical entry, and never on another user's
-- behalf. This is what OwnerAddCarScreen's "Add manually" flow calls.
drop policy if exists brands_insert_custom on public.brands;
create policy brands_insert_custom
  on public.brands
  for insert
  to authenticated
  with check (
    is_custom = true
    and is_active = false
    and created_by = auth.uid()
  );
