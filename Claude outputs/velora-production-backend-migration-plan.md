# VELORA — Production Backend Migration: Architecture & Discovery Report

**Status: DISCOVERY ONLY. No files modified, no SQL executed, no dependencies changed.**
This document is the deliverable for that constraint — it proposes a target architecture and an 8-phase plan, and stops for your approval before any implementation begins.

---

## 1. CURRENT ARCHITECTURE

### What's actually Supabase-backed today (verified against the code, not assumed)

| Domain | Storage today | Supabase touchpoints |
|---|---|---|
| **profiles** | Supabase table `profiles` (columns confirmed in use: `id`, `full_name`, `avatar_url`, `role`) | 6 direct `.from('profiles')` calls in `AuthContext.tsx` (select/update) + `get_public_profile(p_user_id)` RPC (returns only `id, full_name, avatar_url`) |
| **profile extras** (phone, bio, location, location_source, owner verification) | **Local only** — AsyncStorage key `velora.authProfileExtras.v1`, keyed per user id | None |
| **cars** | **Local only** — AsyncStorage key `velora.ownerCars.v1` | None directly. `Car.quantity` is fire-and-forget mirrored into a separate ledger table `local_car_inventory` via the `sync_local_car_inventory(p_local_car_id, p_quantity)` RPC — car name/price/images/etc. are never sent |
| **car images** | **Local only** — raw `expo-image-picker` device URIs (`file://...`) stored inside the local `Car.images` array | None — no `supabase.storage` usage anywhere in the app |
| **bookings** | **Local only** — AsyncStorage key `velora.bookings.v1` (full record: pricing, agreement, status, payment fields) | Only the availability *decision* touches Supabase: `create_local_car_booking_hold(p_booking_id, p_local_car_id, p_renter_id, p_pickup_date, p_dropoff_date)` at creation, and `set_local_car_booking_hold_status(p_booking_id, p_status)` on every status change. The rich booking record itself is never sent |
| **inventory** | `Car.quantity` local field is the sole source of truth; Supabase's `local_car_inventory` table only ever receives what the app pushes into it. The RPC's atomicity (advisory lock + count) protects against overbooking, but does not independently verify the quantity | via the two RPCs above |
| **favorites** | **Local only** — AsyncStorage key `velora.favorites.v1.<userId>` | None |
| **reviews** | **Local only** — AsyncStorage key `velora.reviews.v1` | None |
| **conversations / messages** | **Local only** — AsyncStorage key `velora.conversations.v2` | None |
| **notifications** | **Local only** — AsyncStorage key `velora.notifications.v1` | None |
| **reports** | **Local only** — AsyncStorage key `velora.reports.v1` | None |

### Every Supabase object the app actually depends on (exhaustive)

**Tables touched via `.from()`:** `profiles` (6 call sites, all in `AuthContext.tsx`) — nothing else. (`cars` appears once in an unused dead-code file, `supabaseTest.ts`, never called.)

**RPCs (exactly 4, whole codebase):**
1. `get_public_profile(p_user_id uuid) → {id, full_name, avatar_url}` — `AuthContext.tsx`
2. `sync_local_car_inventory(p_local_car_id text, p_quantity int)` — `CarsContext.tsx`
3. `create_local_car_booking_hold(p_booking_id, p_local_car_id, p_renter_id, p_pickup_date, p_dropoff_date)` — `BookingsContext.tsx`
4. `set_local_car_booking_hold_status(p_booking_id, p_status)` — `BookingsContext.tsx`

**Tables implied but never directly queried (accessed only through RPCs 2–4):** `local_car_inventory` (keyed by the app's own local string car id, no `owner_id` column — a documented, currently-unfixed authorization gap), and a separate holds ledger referred to in code comments as `local_car_inventory_holds`.

**Known, already-documented limitation in the current design:** `local_car_inventory` has no owner-identifying column and the RPC takes no caller-identity parameter, so there is currently no server-side check that the caller actually owns the car whose quantity they're syncing. This was flagged rather than silently patched in an earlier pass, and is the single most important thing a real migration needs to close.

**Everything else (cars beyond quantity, car images, the full booking record, favorites, reviews, chat, notifications, reports) has zero backend presence today.** That's the actual gap this phase is scoping — not because it was overlooked, but because every prior milestone was explicitly scoped to avoid touching the database. This migration is where that debt gets paid off.

---

## 2. TARGET PRODUCTION ARCHITECTURE

The design principle: keep everything that already works exactly as it is for as long as possible, add new tables/RPCs alongside it, and only cut over once the new path is proven — never a big-bang replace.

Two architecture decisions worth flagging before the table plan, because they affect several tables at once:

- **`conversation_members` (which you explicitly asked for) turns 1:1 renter/owner chat into a membership-checked model.** Today, `ConversationDetailScreen` checks `user.id === renterId || user.id === ownerId` client-side. A real backend needs that enforced by RLS, and a membership table makes the RLS policy a single reusable `EXISTS` check instead of repeating `renter_id = auth.uid() OR owner_id = auth.uid()` on every table that touches a conversation (conversations, messages). It also future-proofs for more than 2 participants without a schema change later.
- **`local_car_inventory` / `local_car_inventory_holds` don't get replaced by new inventory tables — they get folded into the new `bookings`/`cars` tables directly.** Once `cars.quantity` is a real column and `bookings` is a real table, the same advisory-lock-and-count logic that `create_local_car_booking_hold` already uses can run directly against `bookings`/`cars` in a new `create_booking` RPC. A separate `booking_items`/inventory-holds table would just be a second source of truth to keep in sync. This is why the table plan below has no `booking_items` table — I'm flagging that explicitly since you asked for it "if needed," and my answer is it isn't, once bookings themselves are server-side.

---

## 3. DATABASE TABLE PLAN

Legend: 🟢 A — keep as-is · 🟡 B — retain temporarily · 🟠 C — eventually replaced · 🔵 D — new · ⚪ E — stays local-only

### 🟢 A. `profiles` (existing — unchanged)
No structural changes to keep the migration low-risk. **Optional, additive-only** columns to consider in Phase 1 (not required, flagged for your decision): `phone text`, `bio text`, `location text`, `location_source text` — this is the one piece of today's local-only "profile extras" that arguably belongs on `profiles` itself rather than a new table, since it's simple self-owned scalar data with no history/audit need. Adding nullable columns doesn't touch `profiles_select_own`/`profiles_update_own` (their `USING (id = auth.uid())` clause is column-agnostic) so this is safe and reversible. I've left owner verification out of this list — see `owner_verifications` below, which I think is the better home for it.

### 🟢 A. `get_public_profile` RPC (existing — unchanged, extend later)
Keep exactly as-is now. A real gap this surfaces: the public profile view currently **always** shows `ownerVerification: {status:'none'}` for anyone but yourself (hardcoded placeholder, not a real read) — so the "Verified Owner" badge never actually appears on another user's public profile today. Fixing this is a candidate for a *new*, additive RPC (`get_public_profile_v2` or extending the existing return shape with `is_verified_owner boolean`) once `owner_verifications` exists — not required for Phase 1, listed here so it's not lost.

### 🟡 B → 🟠 C. `local_car_inventory`, `local_car_inventory_holds` + their 3 RPCs
Retained and left running completely untouched through Phases 1–4 so the current prototype keeps working while the new schema is built alongside it. Once `cars`/`bookings` are live and Phase 5 cuts the app over to them, these become redundant (their job is absorbed into `cars.quantity` + a new `create_booking`/`set_booking_status` RPC pair operating on real tables) and get formally deprecated in Phase 6 — not before.

### 🔵 D. `cars` (new)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `legacy_local_id` | `text`, unique, nullable | Migration traceability only (`car.id` strings like `car-<ts36>-<rand6>`) — never used by the app post-migration |
| `owner_id` | `uuid` NOT NULL, FK → `profiles(id)` | |
| `name` | `text` NOT NULL | |
| `brand_id` | `text` NOT NULL | Brands remain static local reference data (no evidence the app needs a dynamic `brands` table — `BrandCarousel` is local) |
| `category` | `text` NOT NULL | |
| `price_per_day` | `numeric` NOT NULL | |
| `driver_price_per_day` | `numeric` NOT NULL | |
| `top_speed` | `integer` | |
| `transmission` | `text` NOT NULL | |
| `fuel_type` | `text` NOT NULL | |
| `fuel_economy` | `text` | |
| `seats` | `integer` NOT NULL | |
| `features` | `text[]` | |
| `description` | `text` | |
| `discount_percent` | `integer` | |
| `location` | `text` | |
| `rental_modes` | `text[]` NOT NULL | |
| `year` | `integer` | |
| `is_active` | `boolean` NOT NULL default `true` | |
| `quantity` | `integer` NOT NULL default `1` | Replaces `local_car_inventory`'s job |
| `rating` | `numeric` NOT NULL default `0` | Cached/derived from `reviews`, refreshed by trigger (Phase 3) |
| `review_count` | `integer` NOT NULL default `0` | Same |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes:** `owner_id`, `is_active`, `category`, unique on `legacy_local_id`.
**RLS:** `cars_select_public` (SELECT where `is_active = true OR owner_id = auth.uid()`) · `cars_insert_own` (INSERT WITH CHECK `owner_id = auth.uid()`, plus a role check that the caller's `profiles.role = 'owner'`) · `cars_update_own` / `cars_delete_own` (USING `owner_id = auth.uid()`).
**Migration required:** yes — every existing local car record, one-time, per owner, on first post-migration login.

### 🔵 D. `car_images` (new)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `car_id` | `uuid` NOT NULL, FK → `cars(id)` ON DELETE CASCADE | |
| `storage_path` | `text` NOT NULL | Path in a new Supabase Storage bucket (see note below) |
| `position` | `integer` NOT NULL default `0` | Ordering; 0 = cover image |
| `created_at` | `timestamptz` | |

**Indexes:** `car_id`, unique `(car_id, position)`.
**RLS:** `car_images_select_public` (readable whenever the parent car is visible) · insert/update/delete gated by car ownership via an `EXISTS` subquery to `cars`.
**Storage note:** today's images are raw on-device `file://` URIs from `expo-image-picker` — there is no upload step at all. A real migration needs a new Storage bucket (e.g. `car-images`, public read, write scoped to `{owner_id}/{car_id}/...` paths) and an actual upload step in `OwnerAddCarScreen.tsx`, which doesn't exist today. This is new functionality, not a data move — **existing local images can't be "migrated" as files**, only re-uploaded from whatever device still has them locally, or left as broken references if the device is gone. Flagged under Risks.
**Migration required:** partial/best-effort only, per the note above.

### 🔵 D. `bookings` (new)
All fields carried over 1:1 from the current `Booking` interface, renamed to snake_case, plus a denormalized `owner_id`:

`id uuid PK` · `legacy_local_id text unique nullable` · `car_id uuid FK→cars` · `renter_id uuid FK→profiles` · `owner_id uuid FK→profiles` (denormalized from `cars.owner_id` at creation time — avoids a join for RLS, and preserves the historical owner even if a car's ownership record changes) · `rental_mode text` · `pickup_location text` · `dropoff_location text` · `pickup_date date` · `dropoff_date date` · `pickup_time text` · `dropoff_time text` · `days integer` · `subtotal numeric` · `taxes numeric` · `service_fee numeric` · `total numeric` · `payment_method text` · `payment_status text` · `payment_transaction_id text` · `payment_failure_reason text` · `paid_at timestamptz` · `status text CHECK IN ('pending','upcoming','active','completed','cancelled','rejected')` · `agreement_signed_by text` · `agreement_signed_at timestamptz` · `created_at`/`updated_at timestamptz`.

**Indexes:** `car_id`, `renter_id`, `owner_id`, `status`, composite `(car_id, pickup_date, dropoff_date)` for overlap queries.
**RLS:** `bookings_select_participant` (SELECT where `renter_id = auth.uid() OR owner_id = auth.uid()`). **No direct client INSERT/UPDATE grant** — all writes go through `create_booking`/`set_booking_status` RPCs (see §5), exactly mirroring how `local_car_inventory_holds` already has no direct grant today. This is a deliberate continuation of your existing pattern, not a new idea.
**Migration required:** yes, alongside `cars` (bookings reference car ids, so cars must migrate first — see dependency notes in §6).

### 🔵 D. `favorites` (new)
`user_id uuid FK→profiles`, `car_id uuid FK→cars ON DELETE CASCADE`, `created_at timestamptz`. **Composite PK `(user_id, car_id)`** — a favorite is inherently a unique pairing, no surrogate key needed.
**RLS:** `favorites_select_own` / `favorites_insert_own` / `favorites_delete_own`, all `USING/WITH CHECK user_id = auth.uid()`. No RPC needed — plain RLS-gated insert/delete is sufficient for a toggle.
**Migration required:** yes, per-user, once car ids exist server-side to reference.

### 🔵 D. `reviews` (new)
`id uuid PK` · `legacy_local_id text unique nullable` · `booking_id uuid FK→bookings UNIQUE` (one review per booking) · `car_id uuid FK→cars` · `renter_id uuid FK→profiles` · `rating smallint CHECK BETWEEN 1 AND 5` · `comment text` · `created_at timestamptz`.
**Indexes:** `car_id`, `renter_id`, unique `booking_id`.
**RLS:** `reviews_select_public` (reviews are public trust content) · `reviews_insert_eligible` (WITH CHECK `renter_id = auth.uid()` **and** `EXISTS (SELECT 1 FROM bookings WHERE id = booking_id AND renter_id = auth.uid() AND status = 'completed')`). This is a genuine security improvement over today: the "only completed rentals, no duplicate bypass" rule is currently enforced only in the UI (`ReviewScreen.tsx`); moving the eligibility check into the RLS policy itself closes that off at the database level. No update/delete policy — reviews are immutable once posted, matching current behavior.
**Migration required:** yes, once `bookings`/`cars` exist. A trigger (`AFTER INSERT ON reviews`) recomputes `cars.rating`/`cars.review_count` — see §5.

### 🔵 D. `conversations` (new)
`id uuid PK` · `car_id uuid FK→cars` · `renter_id uuid FK→profiles` · `owner_id uuid FK→profiles` · `last_message text` · `last_message_at timestamptz` · `created_at timestamptz`. **Unique `(car_id, renter_id, owner_id)`** — matches the existing `findConversation` lookup exactly.
I'd drop the manually-incremented `unread_for_renter`/`unread_for_owner` counters from the local model in favor of a `last_read_at` timestamp on `conversation_members` (below) — counters are a known source of the kind of off-by-one/race bug you've had me fix twice already this engagement (`MessagesContext.markRead`); a timestamp comparison against `messages.created_at` is race-free by construction. This is a schema-level improvement worth calling out, not just a rename.
**RLS:** `conversations_select_member` via the membership table.

### 🔵 D. `conversation_members` (new, as you asked for)
`conversation_id uuid FK→conversations ON DELETE CASCADE`, `user_id uuid FK→profiles`, `role text CHECK IN ('renter','owner')`, `last_read_at timestamptz`. **Composite PK `(conversation_id, user_id)`**.
**RLS:** `conversation_members_select_own` (`user_id = auth.uid()`). No direct insert/update/delete grant to clients — membership rows are created only by the conversation-start RPC (§5), and `last_read_at` is updated only by a `mark_conversation_read` RPC — this is what makes the membership check trustworthy for `messages`' RLS below.

### 🔵 D. `messages` (new)
`id uuid PK` · `conversation_id uuid FK→conversations ON DELETE CASCADE` · `sender_id uuid FK→profiles` · `text text NOT NULL` · `created_at timestamptz`.
**Indexes:** composite `(conversation_id, created_at)`.
**RLS:** `messages_select_participant` / `messages_insert_participant`, both via `EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())`. This directly closes a real gap: today, "a user can't read an unrelated conversation" is enforced only by `ConversationDetailScreen`'s own `if` check — anyone who could guess/construct a request bypassing the UI currently has nothing stopping them at the data layer, because there is no data layer yet. This is the single most important RLS addition in the whole plan.
**Migration required:** yes, per conversation.

### 🔵 D. `notifications` (new)
`id uuid PK` · `user_id uuid FK→profiles` · `type text CHECK IN ('booking_created','booking_status','message')` · `title text` · `message text` · `target_kind text CHECK IN ('car','conversation','booking')` · `target_id text` · `read boolean default false` · `created_at timestamptz`.
**Indexes:** `(user_id, created_at desc)`, `(user_id, read)`.
**RLS:** `notifications_select_own` (`user_id = auth.uid()`). **No client INSERT grant at all** — notifications should be created exclusively by `SECURITY DEFINER` triggers on `bookings` (status change), `messages` (new message to the other participant), and `reviews` (new review to the car's owner), never by a client-callable path. This is what makes "do not create fake notification events" (your own M10 instruction) enforceable rather than just a convention. `read` toggling goes through a small `mark_notification_read` RPC rather than an open UPDATE grant, for the same reason.
**Migration required:** no — notification history isn't meaningful to carry over; starts fresh.

### 🔵 D. `reports` (new)
`id uuid PK` · `reporter_id uuid FK→profiles` · `target_kind text CHECK IN ('car','user','conversation')` · `target_id text` · `target_label text` · `reason text` · `details text` · `status text CHECK IN ('open','reviewed') default 'open'` · `created_at timestamptz`.
**Indexes:** `reporter_id`, **unique `(reporter_id, target_kind, target_id)`** — this enforces "duplicate prevented" at the DB level too, closing the same kind of client-only-check gap as reviews above.
**RLS:** `reports_select_own` (reporters see only their own submissions — there's no moderator/admin role in this app yet, so no broader read policy; that's a separate, later product decision, not part of this migration) · `reports_insert_own`. No update/delete for regular users.
**Migration required:** no — not meaningful to carry over.

### 🔵 D (optional, recommended). `owner_verifications`
Not in your original table list, but I think it's the right home for what's currently the most fragile piece of local-only data: owner verification (`idType`, `idNumber` — sensitive PII) currently lives *only* in per-device AsyncStorage, meaning **an owner's verification doesn't survive logging in on a second device at all today.** That's arguably the single biggest "not actually multi-device yet" gap in the whole app.

`id uuid PK` · `user_id uuid FK→profiles UNIQUE` · `status text CHECK IN ('none','pending','verified','rejected') default 'none'` · `full_name text` · `phone text` · `id_type text` · `id_number text` · `submitted_at timestamptz` · `verified_at timestamptz` · `rejection_reason text` · `created_at`/`updated_at timestamptz`.
**RLS:** `owner_verifications_select_own` / `owner_verifications_upsert_own`, both `user_id = auth.uid()` — self-service only, no public read at all (not even the safe `get_public_profile` RPC returns raw ID data; at most a derived `is_verified_owner` boolean, per the note under §3 `get_public_profile` above).
**Honesty note for your awareness, not something this migration fixes:** verification today is entirely self-declared — there is no actual review step anywhere in the app (submitting verification immediately flips status to `'verified'` client-side). Moving this to a real table doesn't change that; it only makes the *data* durable across devices. Adding a real review workflow would be a separate, future product decision.

### ⚪ E. Data that should remain local-only
Not everything needs to move. Genuinely per-device, non-authoritative, or ephemeral state is fine to leave in AsyncStorage even after this migration:
- `velora.locationPrompted.v1` — whether the location-permission prompt has already been shown on *this device*. Inherently per-device.
- In-progress form drafts (add/edit car form state before Save, an unsent message draft, report form state before Submit) — normal client-side UI state, never meant to be a source of truth.
- Once each domain above has a real Supabase table, AsyncStorage can still be *kept* per-domain as a **read-through cache** for instant app-open UI and basic offline viewing — that's a legitimate architecture choice (cache, not source-of-truth) and is discussed under Phase 5/6, not something to decide today.

---

## 4. RLS PLAN

Already specified per-table above. Summarized by pattern, since most of this migration's RLS is one of four repeating shapes:

1. **Owner-only** (`cars`, `owner_verifications`, `notifications`, `favorites`, `reports`): `USING/WITH CHECK (owner_column = auth.uid())`. Same shape as your existing, explicitly-preserved `profiles_select_own`/`profiles_update_own`.
2. **Public-read, owner-write** (`cars` for active listings, `car_images`, `reviews`): SELECT open to `anon`/`authenticated` with a visibility condition; writes restricted to the owner.
3. **Participant-membership** (`bookings`, `conversations`, `messages`): SELECT/INSERT gated by an `EXISTS` check against either two denormalized id columns (`bookings`) or a dedicated membership table (`conversations`/`messages` via `conversation_members`). This is the pattern that actually closes today's "enforced only in the UI" gaps.
4. **No client write grant at all, RPC-only** (`bookings` status transitions, `notifications` inserts, the inventory/holds logic): continues your existing, already-proven pattern from `local_car_inventory_holds` — some things are safer as "no direct table access, only through a controlled function" than as an open grant plus a clever policy.

**Nothing in this plan touches `profiles_select_own`, `profiles_update_own`, the `authenticated` grants on `profiles`, or any existing policy.** Every new policy is additive, on new tables.

---

## 5. RPC PLAN

| RPC | Status | Purpose |
|---|---|---|
| `get_public_profile` | 🟢 keep as-is | No change needed now |
| `sync_local_car_inventory`, `create_local_car_booking_hold`, `set_local_car_booking_hold_status` | 🟡 keep running unchanged through Phase 4 | Retired only in Phase 6, after cutover is proven |
| `create_car` | Probably **not needed** | Plain RLS-gated `INSERT` into `cars` (+ `car_images`) is enough; no multi-table atomicity required for a single owner's own insert |
| `create_booking(p_car_id, p_pickup_date, p_dropoff_date, p_rental_mode, ...)` 🔵 new | `SECURITY DEFINER`, direct successor to `create_local_car_booking_hold` | Advisory lock on `car_id` → count overlapping `bookings` in `('pending','upcoming','active')` against `cars.quantity` → insert the full booking row in one transaction. Same atomicity guarantee you already have, just against real tables instead of a mirror |
| `set_booking_status(p_booking_id, p_status)` 🔵 new | `SECURITY DEFINER`, successor to `set_local_car_booking_hold_status` | Additionally validates the transition is legal server-side (today this is only checked client-side in `BookingsContext`'s `applyStatus`) — a real hardening opportunity |
| `start_or_get_conversation(p_car_id, p_renter_id, p_owner_id)` 🔵 new | `SECURITY DEFINER` | Atomically finds-or-creates the conversation row **and** its two `conversation_members` rows — mirrors `findConversation`-or-create today |
| `send_message(p_conversation_id, p_text)` 🔵 new | `SECURITY DEFINER` | Validates sender is a member, inserts the message, updates `conversations.last_message`/`last_message_at`. No manual unread-counter increment needed if `last_read_at` is adopted (§3) |
| `mark_conversation_read(p_conversation_id)` 🔵 new | plain, self-scoped | Sets the caller's own `conversation_members.last_read_at = now()` |
| `submit_review(p_booking_id, p_rating, p_comment)` 🔵 new | `SECURITY DEFINER` | Re-validates eligibility server-side even though RLS already checks it (defense in depth), inserts, and the `AFTER INSERT` trigger below recomputes the car's rating |
| `refresh_car_rating(car_id)` trigger function 🔵 new | `AFTER INSERT ON reviews` | Keeps `cars.rating`/`cars.review_count` in sync — today this is just a plain field on the local `Car` record with no recompute step at all |
| Notification-emitting triggers 🔵 new | `AFTER INSERT/UPDATE` on `bookings`, `messages`, `reviews` | The *only* way `notifications` rows get created — never a client-callable insert |
| `submit_owner_verification(...)` 🔵 new | plain, self-scoped upsert into `owner_verifications` | Same self-declared-immediately semantics as today (see honesty note in §3) — this migration makes it durable, not "more verified" |
| `toggle_favorite`, `submit_report` | Probably **not needed** | Plain RLS-gated insert/delete is sufficient; the unique constraint on `reports` already prevents duplicates without an RPC |

**Nothing above touches, replaces, or duplicates any existing RPC before Phase 6.** Everything new is either an additive function or a trigger on a brand-new table.

---

## 6. MIGRATION PLAN

### Phase 1 — Schema
Create every new 🔵 table above (empty, no data yet), plus the optional `profiles` column additions if you approve them. No RLS enabled yet beyond Postgres defaults (deny-all once RLS is turned on — so enabling RLS with zero policies would break nothing since nothing reads these tables yet).
**Dependencies:** none — this is the foundation everything else builds on.
**Rollback:** trivial. Drop the new tables. Nothing in the running app references them yet, so there is zero blast radius.

### Phase 2 — RLS / security
Enable RLS and add every policy from §4 to the new tables. Existing `profiles` policies untouched.
**Dependencies:** Phase 1 (tables must exist).
**Rollback:** trivial. Policies can be dropped/disabled independently of the tables; still nothing reads them from the app.

### Phase 3 — RPC / transaction logic
Create `create_booking`, `set_booking_status`, `start_or_get_conversation`, `send_message`, `mark_conversation_read`, `submit_review`, `submit_owner_verification`, and the rating/notification triggers. Test each in isolation via the SQL editor / a scratch script — **not** by wiring the app to them yet.
**Dependencies:** Phases 1–2 (tables + RLS must exist for the functions to operate against, even though they run as `SECURITY DEFINER`).
**Rollback:** trivial. Functions/triggers can be dropped independently; nothing in the shipped app calls them yet.

### Phase 4 — Data migration
A one-time, per-user, client-triggered "upload my local data" step (**not** a server-side bulk migration, since the data only exists in each user's own AsyncStorage — there is no central place to migrate *from*). Concretely: on first app open after this ships, for the signed-in user, walk their local `ownerCars`/`bookings`/`favorites`/`reviews`/`conversations` and insert them into the new tables via the Phase 3 RPCs/plain inserts, recording the new UUIDs alongside `legacy_local_id` for traceability. Must run car migration before booking/review/favorite migration (they FK to `cars.id`).
**Dependencies:** Phases 1–3 complete and tested.
**Rollback:** safest phase to abort mid-way — new rows can simply be deleted (matched by `legacy_local_id`) without touching the local AsyncStorage copies, which remain the app's live source of truth until Phase 5 ships. This is exactly why Phases 1–4 are designed to run with zero effect on the live app: you can execute all four, verify the data landed correctly, and still walk away with the app behaving exactly as it does today.

### Phase 5 — Context/service migration
This is where app code actually changes — each context (`CarsContext`, `BookingsContext`, `FavoritesContext`, `ReviewsContext`, `MessagesContext`, `NotificationsContext`, `ReportsContext`) is updated to read/write Supabase instead of (or alongside — see below) AsyncStorage. **Recommend a per-domain feature flag** so this ships incrementally (e.g. favorites first — lowest risk, no FKs to anything else — then reviews, then chat, then cars/bookings last, since they're the most interconnected and highest-stakes). Keep the old local logic *intact but flagged off* rather than deleted, so any regression can be reverted by flipping the flag back, without a code rollback.
**Dependencies:** Phase 4 (a signed-in user's existing data must already be migrated before their context starts reading exclusively from Supabase, or they'd see an empty state).
**Rollback:** flip the feature flag back to local mode. Since old code paths aren't deleted yet, this is a config change, not a redeploy.
**Files that would change:** see §9.

### Phase 6 — Remove local source-of-truth
Only after Phase 5 has been running in production, per-domain, for a real observation window with no regressions: delete the old local-only code paths, retire `local_car_inventory`/`local_car_inventory_holds` and their 3 RPCs, remove the feature flags. AsyncStorage can still be *kept* as a cache layer (see §3, category E) — this phase is about removing it as the *authoritative* copy, not necessarily deleting all local storage code.
**Dependencies:** a proven, stable Phase 5 per domain.
**Rollback:** the hard one — this is the point of no easy return, since the old code is gone. Mitigate by: (a) not batching this across all domains at once — retire one domain's local path at a time, same order as Phase 5; (b) keeping a database backup/point-in-time-recovery checkpoint immediately before each domain's cutover; (c) not starting Phase 6 for any domain until that domain has had a real multi-device user actually exercise it successfully (Phase 7).

### Phase 7 — Multi-device testing
The actual point of this whole migration: verify that a booking made on device A shows up on device B, a message sent from one device appears on the other, favorites/reviews sync across a re-login, etc. This has to happen with two real devices/accounts, not simulated — recommend doing this per-domain right after that domain's Phase 5 ships, rather than waiting for everything to be done.
**Dependencies:** Phase 5 per domain.
**Rollback:** N/A (this is verification, not a change) — a failure here sends you back to Phase 5 for that domain, not to an earlier phase.

### Phase 8 — Production hardening
Once everything above is stable: add realtime subscriptions for chat/notifications if desired (not required for correctness — polling/refresh-on-focus is a legitimate, zero-new-infrastructure interim strategy and may be all you need), add proper Storage upload progress/retry UX for car images, add rate-limiting/abuse checks on report/review submission if needed, review index performance under real data volume, and only then consider whether owner verification needs an actual human review step (a product decision, not a technical one).
**Dependencies:** everything above, stable.
**Rollback:** N/A — this phase is additive polish on an already-working system.

---

## 7. RISKS

- **ID-type mismatch.** Local car/booking ids are strings like `car-<ts36>-<rand6>`; the new tables use `uuid`. Every FK reference (bookings→cars, favorites→cars, reviews→cars/bookings, car_images→cars) depends on getting this remapping exactly right during Phase 4, per-user, with no central "migrate everyone at once" moment possible.
- **Car images can't be migrated as files, only as URIs a device happens to still have.** A user who's uninstalled/reinstalled, or is migrating from a different device than the one they photographed the car on, will have missing images unless re-uploaded. This needs an explicit UX decision (re-prompt for photos?) — not a silent data-loss risk if handled, but a real one if ignored.
- **Owner verification is self-declared, not reviewed.** Making it durable across devices doesn't make it "more true" — worth being clear about this distinction with anyone relying on the "Verified" badge as a trust signal.
- **Dual-write inconsistency window (Phase 5).** While a domain is flagged partially on (some users migrated, some not), any code that assumes "the local store is the source of truth" everywhere needs auditing per-domain before flipping the flag, or you'll get split-brain reads.
- **`local_car_inventory`'s missing ownership check is a real, current gap** — worth deciding whether to close it (add an owner-check parameter to `sync_local_car_inventory`) even during the Phase 1–4 "don't touch anything" window, since it's low-risk (additive parameter, backward compatible) and closes a documented security hole sooner rather than later. Flagging it here rather than silently leaving it, since you asked me not to make any changes this pass.
- **Rating aggregation trigger correctness** — needs to handle review deletion/edit too if those ever get added later, even though neither exists today.
- **Realtime is optional, not required** — don't let "should we add realtime" become a blocker for shipping Phases 1–7; polling-on-focus is a legitimate MVP multi-device strategy.

## 8. ROLLBACK PLAN

Summarized from §6, phase by phase: Phases 1–3 are pure additive database objects nothing in the shipped app calls yet — rollback is "drop what you created," full stop, zero user impact. Phase 4 populates those objects from local data without touching the local copies — rollback is "delete the migrated rows," and the app is unaffected because it's still reading local storage. Phase 5 is the first phase with real rollback risk, mitigated by shipping it behind a per-domain feature flag rather than deleting old code — rollback there is a config flip. Phase 6 is the only phase without a cheap rollback, which is exactly why it's scoped last, done one domain at a time, and gated on that domain having already survived Phase 7 in production. Phases 7–8 don't modify state, so they have no rollback concept of their own — a failure there sends you back to fix Phase 5, not to undo a schema change.

## 9. EXACT FILES THAT WOULD NEED CHANGES (when you approve implementation — not touched now)

- `src/context/CarsContext.tsx`, `src/context/BookingsContext.tsx`, `src/context/FavoritesContext.tsx`, `src/context/ReviewsContext.tsx`, `src/context/MessagesContext.tsx`, `src/context/NotificationsContext.tsx`, `src/context/ReportsContext.tsx` — each gets its read/write path swapped to Supabase (Phase 5), feature-flagged per domain.
- `src/context/AuthContext.tsx` — if you approve moving `phone`/`bio`/`location` onto `profiles` and/or introducing `owner_verifications`, this is where `loadUserFromSession`/`updateProfile`/`submitOwnerVerification` change.
- `src/screens/owner/OwnerAddCarScreen.tsx` — needs a genuinely new image-upload step (Storage), which doesn't exist in any form today.
- A new `src/lib/` helper (e.g. `storageUpload.ts`) for the Storage upload flow.
- `src/types/index.ts` — likely no field renames needed (keep the app-facing camelCase shape and translate at the context layer, the same way `AuthContext` already translates `full_name`↔`name` and `customer`↔`renter` today) — this minimizes downstream screen changes.
- No navigation, no screen beyond `OwnerAddCarScreen` should need to change — every other screen already goes through its context's public API, which is the whole point of the per-domain Context architecture holding up here.

## 10. WHAT SHOULD NOT BE TOUCHED

- `profiles_select_own`, `profiles_update_own`, and every existing grant on `profiles`.
- The 4 existing RPCs and the 2 tables behind them, through Phase 5 (retired only in Phase 6, one domain at a time).
- Auth/session flow (login, signup, email confirmation, deep link callback, role switching) — untouched by this plan entirely.
- Navigation structure.
- Payment / mock payment gateway — completely out of scope, not referenced anywhere in this plan.
- The existing design system, theme, and shared components — this is a data-layer migration only.
- Any dependency versions — everything above uses libraries already installed (`@supabase/supabase-js` covers Storage and RPCs both).

---

**Stopping here per your instruction. No files were modified, no SQL was executed, and no dependency was changed while producing this report — it's the product of read-only inspection of the current codebase plus architectural design.** Let me know which pieces you want to approve (all of Phase 1, a subset of tables, the optional `profiles` columns vs. a separate `owner_verifications` table, etc.) before any implementation begins.
