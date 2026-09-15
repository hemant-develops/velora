-- 0010_trip_extension_requests.sql
-- PHASE 7 -- Trip Extension / Early Return requests.
--
-- NOT required for existing bookings to keep working -- another brand-new,
-- separate table (same reasoning as 0008/0009): nothing about creating or
-- managing a booking always-writes a row here, so this migration is purely
-- additive. Nothing breaks if it hasn't been run yet: the new
-- fetchExtensionRequests() util fails open (empty list) on any error, and
-- BookingDetailsScreen's new "Trip Changes" section simply has nothing to
-- show/act on until it has.
--
-- WHAT THIS DOES
--   The renter can ask to move a confirmed trip's return date later
--   ('extend') or earlier ('early_return'); the owner approves or rejects.
--   On approval, the app (src/utils/tripExtensions.ts, NOT this migration)
--   updates the real bookings.dropoff_date directly via the exact
--   `.update(...).eq('id', ...)` pattern BookingsContext's own
--   confirmBooking/cancelBooking/updateStatus already use successfully
--   against this table -- so this never needed to touch bookings' own
--   (untracked) RLS to know it would work.
--
--   Deliberately does NOT touch bookings.days/subtotal/total -- recomputing
--   a correct price for a shifted date range would mean re-deriving it
--   through whichever of this app's several pricing models (flat/duration-
--   based/KM-based -- see 0002/0003) that specific car actually uses, which
--   is real, car-specific pricing logic this migration has no business
--   guessing at. This is a disclosed limitation, the same class as
--   cancellation not auto-refunding (see BookingDetailsScreen's own
--   showRefundNote) -- the owner's approval dialog says so explicitly, and
--   any price difference is left for the two parties to settle directly.
--
--   RLS: both participants on the booking (renter and owner, via
--   bookings.renter_id/owner_id) can read a booking's requests and can
--   update a row's status -- the app itself enforces WHO is allowed to move
--   a request into which status (only the renter creates/cancels their own
--   pending request; only the owner approves/rejects a pending one; see
--   tripExtensions.ts), the same "RLS scopes participants, the app enforces
--   the exact legal transition" split already used for booking.status
--   itself (see BookingsContext.VALID_TRANSITIONS).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does NOT touch the `bookings` table's own schema, RPCs, or triggers.
--
-- Safe to re-run: create-if-not-exists / drop-then-create policies.

create table if not exists public.booking_extension_requests (
  id                     uuid primary key default gen_random_uuid(),
  booking_id             text not null references public.bookings (id) on delete cascade,
  requested_by           uuid not null references auth.users (id),
  request_type           text not null check (request_type in ('extend', 'early_return')),
  current_dropoff_date   date not null,
  requested_dropoff_date date not null,
  note                   text,
  status                 text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at             timestamptz not null default now(),
  responded_at           timestamptz
);

create index if not exists booking_extension_requests_booking_id_idx
  on public.booking_extension_requests (booking_id);

alter table public.booking_extension_requests enable row level security;

drop policy if exists booking_extension_requests_participants_select on public.booking_extension_requests;
create policy booking_extension_requests_participants_select on public.booking_extension_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );

-- Only the renter on the booking can create a request, and only naming
-- themselves as the requester (never on the owner's behalf).
drop policy if exists booking_extension_requests_renter_insert on public.booking_extension_requests;
create policy booking_extension_requests_renter_insert on public.booking_extension_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and b.renter_id = auth.uid()
    )
  );

-- Either participant can update a request's status -- the app itself is
-- responsible for only ever driving the legal transitions (renter cancels
-- their own pending request; owner approves/rejects a pending one), exactly
-- as already trusted for bookings.status (see the design note above).
drop policy if exists booking_extension_requests_participants_update on public.booking_extension_requests;
create policy booking_extension_requests_participants_update on public.booking_extension_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_extension_requests.booking_id
        and (b.renter_id = auth.uid() or b.owner_id = auth.uid())
    )
  );
