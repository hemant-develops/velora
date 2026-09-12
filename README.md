# VELORA — Car Rentals, Your Way

A production-structured mobile car rental app built with **React Native + Expo + TypeScript**,
recreating the attached Figma reference screens and extended into a full vehicle rental platform
with **Self Drive** and **With Driver** rental modes.

## What's implemented

- **Auth (real Supabase Auth)** — Login and Sign Up both ask you to pick **Rent Cars** or
  **List My Car** before continuing, and that choice decides which app you get (see "Renter vs
  Rental Owner" below). Forgot Password is also implemented. Accounts are real Supabase Auth
  accounts (email/password), not a local mock — sign-up requires email confirmation (a
  `velora://auth-callback` deep link finishes the sign-in once you tap the confirmation email),
  and the session is restored automatically on app restart. `profiles.role` (customer/owner) is
  the source of truth for which app you get; switching modes from an existing renter account into
  Owner Mode still goes through the in-app verification form described below.
- **Renter vs Rental Owner — genuinely different apps, not just a label:**
  - **Renters** get the marketplace: Home browsing/search/filter, Car Details, the full
    booking → rental agreement → payment flow, "My Rents" with Upcoming/Active/Completed tabs.
  - **Rental Owners** get an owner-mode Home banner ("List a new car") plus their "My Rents" tab
    replaced entirely by a **My Listings dashboard** — a premium gradient earnings hero card
    (total earnings, active bookings, this month's earnings), a Listings tab (add/remove
    vehicles, with a rating pill + category tag on every car), a Bookings tab (incoming requests
    with color-coded status badges, mark Active/Completed) and a dedicated **Earnings tab**
    (total earned, pending payout, and a chronological payout history of completed bookings). An
    owner can't book their own listed car — Car Details shows "Manage Listing" instead of
    "Book Now" on cars they own.
  - Switch modes any time from Profile → "Switch to Owner Mode / Switch to Renter Mode".
  - **Owner verification gate** — "Switch to Owner Mode" is no longer a free toggle everyone can
    tap. A brand-new account that picks "List My Car" at signup is verified instantly (it's a
    fresh owner account). An existing **renter** account trying to switch into Owner Mode instead
    hits a **"Become a Rental Owner"** verification form (full legal name, phone, ID type —
    Aadhaar/PAN/Driving License — and ID number) before the switch is allowed, so a casual user
    can't just flip into Owner Mode and list fake cars. (Demo mode approves the form instantly
    with an on-screen note that a production build would plug in a real KYC/ID-verification
    provider here.)
- **The marketplace is owner-listings only, with nothing pre-seeded** — there is no hardcoded car
  catalog merged into what renters see, and the marketplace is genuinely empty until a real owner
  account lists a car through "List My Car". (An earlier build of this app auto-seeded 14 demo
  cars on first run — that has been removed, and `CarsContext` also self-heals any device that
  already had those demo cars saved from that older build, so they disappear automatically.)
- **Renter and Owner accounts are fully separate apps, not shared tabs** — an Owner's bottom tab
  bar only has **Listings** and **Profile**; Home, Messages, Search/Filter, Favorites, My Bookings
  and Payment Methods are renter-only and simply aren't part of an owner account's navigation.
  Switching modes from Profile swaps the whole tab set, not just the content inside one tab.
- **Real car photos** — listing a car uses the device's actual camera or photo gallery
  (`expo-image-picker`, up to 6 photos) instead of a random stock image; a listing can't be
  published without at least one real photo.
- **Ratings & reviews** — once a booking is Completed, the renter gets a "Rate & Review" prompt
  (1-5 stars + an optional written review) from My Rents. Submitting one updates that car's
  average rating live and the review shows up in a Reviews section on Car Details. A freshly
  listed car with no reviews yet is labelled "New" instead of showing a fake 0.0 rating.
- **Home** — profile header, search, filter, category chip row (Economy/Hatchback/Sedan/SUV/MUV/
  Premium/Luxury Sedan/Sports Car/Convertible/Electric), horizontal brand carousel (11 brands:
  Tesla, BMW, Lamborghini, Honda, Ferrari, Toyota, Mercedes, Audi, Hyundai, Kia, Maruti Suzuki),
  and a scrollable "Popular Cars" list.
- **14 seed vehicles** spanning every category, from a Maruti Alto (₹1,000/day) to a Lamborghini
  Revuelto (₹24,999/day) — not a luxury-only catalog.
- **Car Details** — swipeable image gallery, specs grid (top speed/transmission/fuel/mileage/
  seats/A-C), features chips (Bluetooth, GPS, Android Auto, Sunroof, ...), expandable description,
  Self Drive vs With Driver pricing shown side by side, sticky bottom booking bar.
- **Self Drive / With Driver booking flow** — a `RentalModeSelector` at the top of the booking
  screen switches pricing live; With Driver shows a "Professional Verified Driver" info card.
  Pickup/drop-off location + date steppers + time slots, live price breakdown (subtotal + taxes
  10% + ₹250 service fee), Continue to Agreement.
- **Rental Agreement & e-signature** — before payment, every booking goes through a Rental
  Agreement screen: a plain-language agreement (rental period, self-drive vs with-driver terms,
  damage/fuel/late-return/cancellation/liability clauses) generated from that booking's actual
  car, dates and price, a "I have read and agree" checkbox, and a type-your-name signature field.
  The signer's name and timestamp are stored on the booking and shown on Payment, the Booking
  Confirmation screen, and the owner's Bookings tab.
- **Payment screen** — UPI / Credit-Debit Card / Wallet / Cash-Pay-Later selection (mock), a short
  simulated processing delay, then the booking is actually created and you land on a polished
  Booking Confirmation screen with a `VLR-YYYYMMDD-###` booking ID.
- **My Rents** — Upcoming / Active / Completed tabs with real booking data (renters only — see
  above for what owners see instead).
- **Favorites** — heart icon on every car card / details screen, persisted locally, with its own
  Favorites screen reachable from Profile.
- **Messages are fully live, not canned demo threads** — the old hardcoded conversations
  (Driver Support, VELORA Support, etc.) are gone. A conversation only exists once a real message
  has actually been sent: a renter can message a car's owner straight from Car Details (before
  ever booking) via a chat-bubble icon in the header, and the thread only shows up on the owner's
  side the moment that first message arrives. Unread counts on the Messages tab badge are
  per-role and per-user.
- **Booking alerts for owners** — the instant a renter completes a booking, the app buzzes the
  phone (a distinct short-long-short vibration pattern) and plays a short chime, so an owner
  running the app knows a new booking just came in without having to keep checking the Bookings
  tab.
- **Profile** — Edit Profile, My Bookings, Favorites, Payment Methods (demo), Notifications,
  Privacy/Terms, Help & Support, and Logout. Owner accounts additionally see a **Total Earnings**
  snapshot card (with a link straight into the Owner Dashboard's Earnings tab) right above the
  mode-switch button; a renter who isn't yet a verified owner sees a **"Become a Rental Owner"**
  button here instead of a free mode switch (see the verification gate above). (All tab-bar
  screens now reserve extra bottom padding for the floating pill tab bar — in an earlier build
  this made the last row of a long list, e.g. Logout, render underneath it.)
- **Clickable location** — tapping the location row on Home opens a picker with two options:
  "Use Current Location" (on-device GPS via `expo-location`, reverse-geocoded to a
  "City, Region, Country" label — no Google Maps API key or billing needed) or typing a city in
  manually. Either way it updates your profile's location immediately.
- **Search & Filter** — live local search by name/brand/category, plus a filter modal (rental
  mode, brand, max price, transmission, fuel type, seats, car type) that actually narrows the list.
- Centralized **theme** (colors, typography, spacing, radii, shadows), **mock data** (cars, brands,
  users, conversations) and **reusable components** — see `src/` structure below.

## Project structure

```
src/
  theme/        design tokens (colors, typography, spacing, radii, shadows)
  types/        shared TypeScript models (Car, Booking, AppUser, RentalMode, ...)
  data/         mock data + centralized image URLs
  context/      Auth, Cars (search/filter/listings), Favorites, Bookings, Messages
  components/   reusable UI (CarCard, RentalModeSelector, SearchBar, PrimaryButton, ...)
  navigation/   Auth stack, bottom tabs, root stack
  screens/      auth/, home/, car/, booking/, payment/, rents/, messages/, profile/,
                owner/, favorites/, misc/
```

## Running the app

This project's root is `D:\car rental` — that's where `package.json` lives, so run these
commands from there directly (no subfolder `cd` needed):

```bash
npm install
npx expo start
```

Then either:
- **Fastest way to see it**: install **Expo Go** on your Android phone and scan the QR code
  printed in the terminal.
- **Android emulator via Expo**: press `a` in the terminal after `npx expo start` (needs an
  emulator already running, or a device plugged in with USB debugging on).
- **Full native build in Android Studio**:
  ```bash
  npx expo prebuild -p android
  ```
  This generates a real `android/` folder. Open **that generated folder** in Android Studio via
  "Open" (not "New Project") — let Gradle sync, then Run ▶ on an emulator or device.

## Notes & limitations

- **Authentication is real Supabase Auth** (`src/lib/supabase.ts` / `src/context/AuthContext.tsx`)
  — email/password sign-up with required email confirmation, session persistence/auto-refresh via
  AsyncStorage, and deep-link handling for the confirmation callback. `profiles.role` drives
  renter/owner routing. Profile fields with no confirmed `profiles` column (phone, bio, location,
  owner-verification detail) are kept in an on-device-only cache
  (`velora.authProfileExtras.v1`) so they survive a full app restart without a schema change.
- **Known limitation — cross-user profile lookups:** `profiles_select_own` RLS (`id = auth.uid()`
  only, intentionally not weakened) means `AuthContext.getUserById(id)` can only ever resolve the
  signed-in user's own profile. `OwnerPublicProfileScreen`, `CustomerProfileScreen`, and Car
  Details' "Listed by" row fall back to the booking/car record's own name/avatar snapshot instead
  of a live lookup for anyone but yourself. Fixing this properly needs a deliberate RLS/data
  design (e.g. a public-safe profile view), not a loosened policy — tracked as a
  production-hardening item, not fixed here.
- **Payment is a documented mock gateway abstraction** (`src/lib/paymentGateway.ts`), not a real
  payment gateway — no card/payment credentials are ever collected or stored. Cash/Pay-Later
  always succeeds with no charge and stays `unpaid`; other methods simulate a processing delay and
  a small random decline rate so retry-after-failure is exercised. `Booking.paymentStatus`
  (unpaid/processing/paid/failed) is tracked separately from the booking's own lifecycle status,
  so cancellation logic never has to guess about money. Swap `processPayment()` in that one file
  for a real gateway (Razorpay/Stripe/etc.) when ready — every call site already goes through it.
- **Car inventory / owner listings are still local-first** (AsyncStorage via `CarsContext`) —
  only `quantity`/`is_active` are best-effort mirrored to Supabase for availability accounting.
  The inventory RPCs backing multi-unit availability are prototype-scoped: they enforce atomic
  overbooking protection, but not full production-grade per-owner authorization the way a real
  backend would. Treat this the same as the `profiles_select_own` item above — a known, documented
  limitation, not something silently claimed as production-ready.
- Images are pulled from Unsplash URLs centralized in `src/data/images.ts` — swap for local
  assets or your own CDN by editing that one file.
- Dates in the booking flow use a simple +/- day stepper rather than a native calendar picker, to
  avoid a native module that would need a custom dev build to test.
- Owner-listed vehicles are stored on-device via AsyncStorage and are not shared between devices
  since there's no backend yet — the marketplace genuinely starts empty on a fresh install.
- Car photos picked from the camera/gallery are stored as local file URIs (not uploaded anywhere),
  so they're only visible on the device that listed the car until a real backend/CDN is added.
- No real push-notification service or chat backend — the in-app vibration/sound booking alert
  and the live messaging system both work fully on-device, but nothing is sent between two
  different physical devices yet (there's no backend to relay it). Wiring in Firebase Cloud
  Messaging (or similar) plus a real-time backend (Socket.IO/Firebase/Supabase) would carry both
  over to separate devices.
- `expo-audio`, `expo-location` and `expo-image-picker` are native modules with config in
  `app.json`'s `plugins`. If you're testing via the native Android Studio build (the generated
  `android/` folder), re-run `npx expo prebuild -p android` after pulling these changes so the
  native project regenerates with the new permissions/modules — Expo Go doesn't need this extra
  step.
#   v e l o r a  
 