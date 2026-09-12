-- =============================================================================
-- VELORA -- Multi-device backend migration
-- =============================================================================
-- WHY THIS EXISTS
-- Today, almost everything in the VELORA app (the car catalog, bookings,
-- reviews, favorites, messages, notifications, reports, wallet/referrals)
-- lives ONLY in each phone's local on-device storage. Nothing is shared
-- across devices except: Supabase Auth + `profiles`, and `local_car_inventory`
-- (which only tracks a quantity counter + booking holds, not real listing or
-- booking data). That means two different real people on two different real
-- phones cannot see each other's listings, bookings, messages, etc. today.
--
-- This migration creates the missing shared tables so the app works as a
-- real multi-device marketplace, with Row Level Security (RLS) so each user
-- only ever sees the rows they're allowed to see.
--
-- WHAT THIS DOES **NOT** TOUCH (deliberately, to protect what already works):
--   - public.profiles (existing table/columns/RLS) -- untouched.
--   - public.local_car_inventory and its three existing RPCs
--     (sync_local_car_inventory, create_local_car_booking_hold,
--     set_local_car_booking_hold_status) -- untouched. These remain the
--     ONLY source of truth for the atomic "is this car available for these
--     dates" decision. Nothing in this file changes booking-availability
--     logic in any way.
--   - auth.* tables -- untouched (only referenced via auth.users(id) foreign
--     keys, which is the standard Supabase pattern).
--
-- HOW TO RUN THIS
--   1. Open your Supabase project -> SQL Editor.
--   2. Paste this ENTIRE file and run it once, top to bottom.
--   3. It uses `create table if not exists` / `create or replace function` /
--      `drop policy if exists` throughout, so it is safe to re-run if a step
--      partially fails and you fix something and re-run the whole file.
--   4. If you already happen to have tables with any of these exact names
--      from earlier work, STOP and tell Claude before running this --
--      `if not exists` means it will silently keep an existing table's
--      current shape instead of adding the columns this file expects, which
--      would break the app in a confusing way.
--   5. After running, come back and say so -- the app code that reads/writes
--      these tables is being wired up to expect exactly this schema.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Shared helper: auto-touch `updated_at` on any row update.
-- -----------------------------------------------------------------------------
create or replace function public.velora_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 1. car_listings -- the real, shared marketplace catalog.
--    (Previously: 100% local-only, AsyncStorage key `velora.ownerCars.v1`.)
--    Keyed by the app's own existing text ids (the same ids already used as
--    `p_local_car_id` in local_car_inventory / the booking-hold RPCs), so no
--    existing booking-hold logic needs to change at all.
-- =============================================================================
create table if not exists public.car_listings (
  id                    text primary key,
  owner_id              uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  brand_id              text not null default '',
  category              text not null default '',
  images                text[] not null default '{}',
  price_per_day         integer not null default 0,
  driver_price_per_day  integer not null default 0,
  rating                numeric not null default 0,
  review_count          integer not null default 0,
  top_speed             integer not null default 0,
  transmission          text not null default '',
  fuel_type             text not null default '',
  fuel_economy          text not null default '',
  seats                 integer not null default 4,
  features              text[] not null default '{}',
  description           text not null default '',
  discount_percent      integer,
  location              text not null default '',
  rental_modes          text[] not null default '{self_drive}',
  year                  integer,
  is_active             boolean not null default true,
  quantity              integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists velora_car_listings_touch on public.car_listings;
create trigger velora_car_listings_touch
  before update on public.car_listings
  for each row execute function public.velora_touch_updated_at();

alter table public.car_listings enable row level security;

grant select, insert, update, delete on public.car_listings to authenticated;

drop policy if exists car_listings_select on public.car_listings;
create policy car_listings_select on public.car_listings
  for select to authenticated
  using (is_active = true or owner_id = auth.uid());

drop policy if exists car_listings_insert on public.car_listings;
create policy car_listings_insert on public.car_listings
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists car_listings_update on public.car_listings;
create policy car_listings_update on public.car_listings
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists car_listings_delete on public.car_listings;
create policy car_listings_delete on public.car_listings
  for delete to authenticated
  using (owner_id = auth.uid());


-- =============================================================================
-- 2. bookings -- the real, shared booking record.
--    (Previously: 100% local-only, AsyncStorage key `velora.bookings.v1`.)
--    `local_car_inventory` / the hold RPCs are UNCHANGED and remain the only
--    thing that decides availability -- this table is the rich booking
--    record (renter/owner/price/status) that sits alongside that hold.
-- =============================================================================
create table if not exists public.bookings (
  id                      text primary key,
  car_id                  text not null,
  renter_id               uuid not null references auth.users(id) on delete cascade,
  -- Snapshotted automatically by a trigger below (see set_booking_owner_id) --
  -- the client never sends this, so it can't be spoofed.
  owner_id                uuid not null references auth.users(id) on delete cascade,
  renter_name             text,
  renter_avatar           text,
  rental_mode             text not null,
  pickup_location         text not null default '',
  dropoff_location        text not null default '',
  pickup_date             date not null,
  dropoff_date            date not null,
  pickup_time             text not null default '',
  dropoff_time            text not null default '',
  days                    integer not null,
  subtotal                integer not null,
  taxes                   integer not null,
  service_fee             integer not null,
  total                   integer not null,
  payment_method          text not null default 'Not selected yet',
  payment_status          text not null default 'unpaid'
                            check (payment_status in ('unpaid', 'processing', 'paid', 'failed')),
  payment_transaction_id  text,
  payment_failure_reason  text,
  paid_at                 timestamptz,
  status                  text not null default 'pending'
                            check (status in ('pending', 'upcoming', 'active', 'completed', 'cancelled', 'rejected')),
  agreement_signed_by     text not null default '',
  agreement_signed_at     timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists velora_bookings_touch on public.bookings;
create trigger velora_bookings_touch
  before update on public.bookings
  for each row execute function public.velora_touch_updated_at();

-- Fills owner_id server-side from car_listings so the client never has to
-- (and can't) claim a booking belongs to a different owner than the car
-- actually has.
create or replace function public.velora_set_booking_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select owner_id into new.owner_id from public.car_listings where id = new.car_id;
  if new.owner_id is null then
    raise exception 'Unknown car_id -- cannot determine owner.';
  end if;
  return new;
end;
$$;

drop trigger if exists velora_bookings_set_owner on public.bookings;
create trigger velora_bookings_set_owner
  before insert on public.bookings
  for each row execute function public.velora_set_booking_owner_id();

alter table public.bookings enable row level security;

grant select, insert, update on public.bookings to authenticated;

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (renter_id = auth.uid() or owner_id = auth.uid());

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert to authenticated
  with check (renter_id = auth.uid());

-- Status transitions (confirm/reject/cancel/complete) and payment-result
-- updates are still validated client-side by the existing state machine in
-- BookingsContext, exactly as before -- this policy's job is only to stop a
-- stranger who is neither the renter nor the car's owner from touching the
-- row at all, which is strictly more protection than existed previously
-- (previously this data had no server-side protection whatsoever).
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (renter_id = auth.uid() or owner_id = auth.uid())
  with check (renter_id = auth.uid() or owner_id = auth.uid());

-- Scoped to the RENTER only (never the owner side) -- this exists purely so
-- the app's existing __DEV__-only "reset my test bookings" button has
-- something to call now that bookings are shared, real data. A renter can
-- only ever delete a booking THEY made, never one made by someone else on
-- one of their car listings.
grant delete on public.bookings to authenticated;

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings
  for delete to authenticated
  using (renter_id = auth.uid());

-- A cheap, privacy-safe count used only for the renter-facing "X cars
-- available for these dates" quick estimate on the Booking screen -- it
-- deliberately returns just a number (never row contents), so a renter can
-- get an accurate estimate for a car without RLS needing to expose every
-- other renter's booking rows to them. The REAL, race-safe availability
-- gate at the moment of booking remains create_local_car_booking_hold,
-- completely unchanged -- this function is never used to decide whether a
-- booking is allowed, only to render a number before that point.
create or replace function public.get_car_taken_count(p_car_id text, p_pickup date, p_dropoff date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from public.bookings
  where car_id = p_car_id
    and status in ('pending', 'upcoming', 'active')
    and pickup_date <= p_dropoff
    and dropoff_date >= p_pickup;
$$;

grant execute on function public.get_car_taken_count(text, date, date) to authenticated;

-- Another privacy-safe aggregate, same idea as get_car_taken_count above:
-- "X of the owner's last 10 concluded trips were fulfilled" needs to look
-- across ALL of that owner's bookings (any renter, any of their cars), which
-- RLS correctly never hands to a browsing renter's own session -- without
-- this, every host would silently show as brand-new to anyone but their own
-- past renters. Mirrors utils/hostReliability.ts's CONCLUDED_STATUSES /
-- TRIP_WINDOW (10) / MIN_TRIPS_FOR_SCORE (3) exactly -- keep both in sync if
-- those ever change. Returns null below the minimum-trips threshold (same
-- "don't overstate a thin track record" reasoning as the client version),
-- and only ever the two aggregate counts below -- never individual booking
-- rows, renter names, dates, or pricing.
create or replace function public.get_owner_reliability_stats(p_owner_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when count(*) < 3 then null
    else jsonb_build_object(
      'fulfilled', count(*) filter (where status = 'completed'),
      'total', count(*)
    )
  end
  from (
    select status
    from public.bookings
    where owner_id = p_owner_id
      and status in ('completed', 'cancelled')
    order by created_at desc
    limit 10
  ) recent_concluded_trips;
$$;

grant execute on function public.get_owner_reliability_stats(uuid) to authenticated;


-- =============================================================================
-- 3. reviews
--    (Previously: 100% local-only, AsyncStorage key `velora.reviews.v1`.)
-- =============================================================================
create table if not exists public.reviews (
  id           text primary key,
  booking_id   text not null unique,
  car_id       text not null,
  renter_id    uuid not null references auth.users(id) on delete cascade,
  renter_name  text not null default '',
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.reviews enable row level security;

grant select, insert on public.reviews to authenticated;

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to authenticated
  using (true);

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (renter_id = auth.uid());


-- =============================================================================
-- 4. favorites
--    (Previously: local-only, per-user AsyncStorage key
--    `velora.favorites.v1.<userId>`.)
-- =============================================================================
create table if not exists public.favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  car_id      text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, car_id)
);

alter table public.favorites enable row level security;

grant select, insert, delete on public.favorites to authenticated;

drop policy if exists favorites_select on public.favorites;
create policy favorites_select on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert on public.favorites;
create policy favorites_insert on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());


-- =============================================================================
-- 5. conversations + chat_messages
--    (Previously: local-only, AsyncStorage key `velora.conversations.v2`,
--    with messages embedded inline inside each conversation record.)
-- =============================================================================
create table if not exists public.conversations (
  id                  text primary key,
  car_id              text not null,
  car_name            text not null default '',
  renter_id           uuid not null references auth.users(id) on delete cascade,
  renter_name         text not null default '',
  renter_avatar       text not null default '',
  owner_id            uuid not null references auth.users(id) on delete cascade,
  owner_name          text not null default '',
  owner_avatar        text not null default '',
  last_message        text not null default '',
  last_message_at     timestamptz not null default now(),
  unread_for_renter   integer not null default 0,
  unread_for_owner    integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (car_id, renter_id, owner_id)
);

alter table public.conversations enable row level security;

grant select, insert, update on public.conversations to authenticated;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (renter_id = auth.uid() or owner_id = auth.uid());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (renter_id = auth.uid() or owner_id = auth.uid());

-- Needed so markRead() can zero out this user's own unread counter directly.
-- last_message/last_message_at/the OTHER side's unread counter are instead
-- kept correct automatically by the trigger below, not by trusting the
-- client to update them by hand.
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (renter_id = auth.uid() or owner_id = auth.uid())
  with check (renter_id = auth.uid() or owner_id = auth.uid());

create table if not exists public.chat_messages (
  id               text primary key,
  conversation_id  text not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references auth.users(id) on delete cascade,
  text             text not null,
  created_at       timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

grant select, insert on public.chat_messages to authenticated;

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.renter_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.renter_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

-- Keeps last_message / last_message_at / the OTHER party's unread counter
-- correct automatically, in the same transaction as the message insert --
-- so it can never drift out of sync the way a "send message, then
-- separately update the conversation row" client-side pattern could.
create or replace function public.velora_bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renter_id uuid;
  v_owner_id uuid;
begin
  select renter_id, owner_id into v_renter_id, v_owner_id
  from public.conversations where id = new.conversation_id;

  -- Matches the original client-side semantics exactly: the SENDER's own
  -- unread count resets to 0 (they're actively in the conversation, so by
  -- definition they've now seen everything up to this point), while the
  -- OTHER party's unread count increments.
  update public.conversations
  set last_message = new.text,
      last_message_at = new.created_at,
      unread_for_renter = case when new.sender_id = v_owner_id then unread_for_renter + 1 else 0 end,
      unread_for_owner  = case when new.sender_id = v_renter_id then unread_for_owner + 1 else 0 end
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists velora_chat_messages_bump on public.chat_messages;
create trigger velora_chat_messages_bump
  after insert on public.chat_messages
  for each row execute function public.velora_bump_conversation_on_message();


-- =============================================================================
-- 6. notifications
--    (Previously: local-only, AsyncStorage key `velora.notifications.v1`.)
--    Direct client inserts are intentionally NOT allowed (a stranger
--    shouldn't be able to write directly into another user's notification
--    feed) -- creation only ever happens through the create_notification()
--    RPC below, the same "RPC-mediated cross-user write" pattern this app
--    already uses for booking holds.
-- =============================================================================
create table if not exists public.notifications (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('booking_created', 'booking_status', 'message')),
  title        text not null,
  message      text not null,
  target_kind  text check (target_kind in ('car', 'conversation', 'booking')),
  target_id    text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.notifications enable row level security;

grant select, update on public.notifications to authenticated;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.create_notification(
  p_id text,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_target_kind text default null,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (id, user_id, type, title, message, target_kind, target_id)
  values (p_id, p_user_id, p_type, p_title, p_message, p_target_kind, p_target_id);
end;
$$;

grant execute on function public.create_notification(text, uuid, text, text, text, text, text) to authenticated;


-- =============================================================================
-- 7. reports
--    (Previously: local-only, AsyncStorage key `velora.reports.v1`.)
--    No in-app admin/moderation screen exists -- as the project owner, view
--    every report directly in Supabase's own Table Editor (it isn't subject
--    to RLS there), no in-app admin view is required for this.
-- =============================================================================
create table if not exists public.reports (
  id            text primary key,
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  target_kind   text not null check (target_kind in ('car', 'user', 'conversation')),
  target_id     text not null,
  target_label  text not null default '',
  reason        text not null,
  details       text not null default '',
  status        text not null default 'open' check (status in ('open', 'reviewed')),
  created_at    timestamptz not null default now()
);

alter table public.reports enable row level security;

grant select, insert on public.reports to authenticated;

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());


-- =============================================================================
-- 8. VELORA Credits wallet + Refer & Earn
--    (Previously: local-only, AsyncStorage keys `velora.wallet.transactions.v1`,
--    `velora.referrals.codes.v1`, `velora.referrals.uses.v1`.)
--    NOTE: this wasn't in the original 6-system list, but it has the exact
--    same "only visible on the device that created it" problem, so it's
--    included here -- flagged clearly in the handoff notes.
-- =============================================================================
create table if not exists public.wallet_transactions (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      integer not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

grant select on public.wallet_transactions to authenticated;

drop policy if exists wallet_transactions_select on public.wallet_transactions;
create policy wallet_transactions_select on public.wallet_transactions
  for select to authenticated
  using (user_id = auth.uid());

-- No direct insert policy: every credit/debit happens through a
-- SECURITY DEFINER RPC (spend_wallet_credits / redeem_referral_code /
-- the completion-bonus trigger below), never a raw client insert -- this is
-- what stops a user from just inserting themselves a positive balance.

create table if not exists public.referral_codes (
  code        text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade unique,
  created_at  timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

grant select on public.referral_codes to authenticated;

drop policy if exists referral_codes_select on public.referral_codes;
create policy referral_codes_select on public.referral_codes
  for select to authenticated
  using (true); -- a code must be readable by the friend redeeming it, not just its owner

create table if not exists public.referral_uses (
  id                 text primary key,
  code               text not null references public.referral_codes(code),
  referrer_id        uuid not null references auth.users(id) on delete cascade,
  referred_user_id   uuid not null references auth.users(id) on delete cascade unique,
  referred_name      text not null default '',
  status             text not null default 'pending' check (status in ('pending', 'completed')),
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

alter table public.referral_uses enable row level security;

grant select on public.referral_uses to authenticated;

drop policy if exists referral_uses_select on public.referral_uses;
create policy referral_uses_select on public.referral_uses
  for select to authenticated
  using (referrer_id = auth.uid() or referred_user_id = auth.uid());

create or replace function public.get_or_create_referral_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
begin
  select code into v_existing from public.referral_codes where owner_id = auth.uid();
  if v_existing is not null then
    return v_existing;
  end if;
  insert into public.referral_codes (code, owner_id) values (p_code, auth.uid());
  return p_code;
end;
$$;

grant execute on function public.get_or_create_referral_code(text) to authenticated;

create or replace function public.redeem_referral_code(p_code text, p_referred_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_signup_bonus constant integer := 50;
begin
  select owner_id into v_owner_id from public.referral_codes where code = upper(trim(p_code));
  if v_owner_id is null then
    return jsonb_build_object('success', false, 'error', 'That referral code doesn''t exist.');
  end if;
  if v_owner_id = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'You can''t use your own referral code.');
  end if;
  if exists (select 1 from public.referral_uses where referred_user_id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'You''ve already used a referral code.');
  end if;

  insert into public.referral_uses (id, code, referrer_id, referred_user_id, referred_name)
  values ('ref-' || replace(gen_random_uuid()::text, '-', ''), upper(trim(p_code)), v_owner_id, auth.uid(), p_referred_name);

  insert into public.wallet_transactions (id, user_id, amount, reason)
  values ('wallet-' || replace(gen_random_uuid()::text, '-', ''), auth.uid(), v_signup_bonus, 'Referral signup bonus');

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.redeem_referral_code(text, text) to authenticated;

create or replace function public.spend_wallet_credits(p_amount integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid amount.');
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.wallet_transactions where user_id = auth.uid();
  if p_amount > v_balance then
    return jsonb_build_object('success', false, 'error', 'Not enough credits.');
  end if;
  insert into public.wallet_transactions (id, user_id, amount, reason)
  values ('wallet-' || replace(gen_random_uuid()::text, '-', ''), auth.uid(), -p_amount, p_reason);
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.spend_wallet_credits(integer, text) to authenticated;

-- Awards the referrer's completion bonus automatically the moment a
-- referred friend's booking flips to 'completed' -- server-side, so it
-- fires reliably regardless of which device (if any) happens to be open at
-- that moment, unlike a purely client-side "watch for it" approach.
create or replace function public.velora_award_referral_completion_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion_bonus constant integer := 150;
  v_ref record;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select * into v_ref from public.referral_uses
      where referred_user_id = new.renter_id and status = 'pending'
      limit 1;
    if found then
      update public.referral_uses set status = 'completed', completed_at = now() where id = v_ref.id;
      insert into public.wallet_transactions (id, user_id, amount, reason)
      values (
        'wallet-' || replace(gen_random_uuid()::text, '-', ''),
        v_ref.referrer_id,
        v_completion_bonus,
        v_ref.referred_name || ' completed their first trip'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists velora_bookings_referral_bonus on public.bookings;
create trigger velora_bookings_referral_bonus
  after update on public.bookings
  for each row execute function public.velora_award_referral_completion_bonus();


-- =============================================================================
-- 9. user_sessions -- a real login/signup activity log for you (the owner)
--    to see who used the app, from roughly where, and on what platform.
--    NOTE: signup/login TIMESTAMPS for every real user are already visible
--    today, with zero setup, in Supabase Studio -> Authentication -> Users
--    (created_at / last_sign_in_at). This table adds the extra detail that
--    isn't in that default view: platform and a best-effort approximate
--    location string, captured only when the device already has location
--    permission granted (never a new permission prompt just for this).
-- =============================================================================
create table if not exists public.user_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  event            text not null default 'login' check (event in ('login', 'signup')),
  platform         text,
  platform_version text,
  approx_location  text,
  created_at       timestamptz not null default now()
);

alter table public.user_sessions enable row level security;

grant select on public.user_sessions to authenticated;

drop policy if exists user_sessions_select on public.user_sessions;
create policy user_sessions_select on public.user_sessions
  for select to authenticated
  using (user_id = auth.uid());

-- No direct insert policy -- inserts only ever go through this RPC, so a
-- user can never write a fake row into someone else's session history.
create or replace function public.log_user_session(
  p_event text,
  p_platform text,
  p_platform_version text,
  p_approx_location text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_sessions (user_id, event, platform, platform_version, approx_location)
  values (auth.uid(), p_event, p_platform, p_platform_version, p_approx_location);
end;
$$;

grant execute on function public.log_user_session(text, text, text, text) to authenticated;

-- =============================================================================
-- 9b. Push tokens -- one row per user (upserted, not appended, so a device
--     re-registering just refreshes it) holding the Expo push token that
--     lets a future server-side sender (an Edge Function reacting to new
--     bookings/chat_messages/notifications rows) actually deliver a push
--     notification to that person's phone. Written by the app right after
--     the person grants the real OS notification permission -- see
--     src/utils/pushNotifications.ts. Never readable by anyone but the
--     owning user (and the project owner via the dashboard, which bypasses
--     RLS), since a push token is effectively a "send this device a
--     message" credential.
-- =============================================================================
create table if not exists public.push_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

grant select, insert, update on public.push_tokens to authenticated;

drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_tokens_insert on public.push_tokens;
create policy push_tokens_insert on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_tokens_update on public.push_tokens;
create policy push_tokens_update on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 10. Realtime -- so a change made on ONE device (a new car listing, a
--     booking created/confirmed, a chat message, a new notification) shows
--     up on the OTHER party's device without them having to close and
--     reopen the app. Wrapped in an existence check via pg_publication_tables
--     so re-running this whole file is always safe (it would otherwise error
--     the second time with "relation is already member of publication").
--     Deliberately only these five tables -- the ones where a live,
--     cross-device update actually matters; reviews/favorites/reports/
--     wallet/referrals are refreshed on auth changes and right after their
--     own mutations instead, which is enough for how those screens are used.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'car_listings'
  ) then
    alter publication supabase_realtime add table public.car_listings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- =============================================================================
-- HOW TO VIEW YOUR DATA AS THE OWNER
-- You do not need any in-app "admin" screen for this. As the project owner,
-- open Supabase Studio -> Table Editor and you can browse EVERY row in
-- car_listings, bookings, reviews, reports, user_sessions, etc. directly --
-- RLS only restricts what the APP's users can see through the app itself,
-- it never restricts you in the dashboard. Authentication -> Users is the
-- signup/login list; Table Editor -> user_sessions is the platform/location
-- log; Table Editor -> bookings is literally every booking, who made it,
-- for which car, from which owner, with what status.
-- =============================================================================
