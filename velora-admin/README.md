# VELORA Admin Website

Internal management console for the VELORA car-rental marketplace. This is
a **separate Next.js web project** — it is not part of, and does not run
inside, the VELORA mobile app (Expo/React Native, `D:\car rental`). Both
apps talk to the **same Supabase project**:

```
VELORA Mobile App (Expo)
        ↓
   Supabase (shared)
        ↑
VELORA Admin Website (this project)
        ↓
      Vercel
```

## Phase 1 scope (current)

- Admin login (Supabase Auth)
- Admin authorization enforced server-side via RLS (`is_admin()` + the
  `admin_users` table) — never a client-side `role === 'admin'` check
- Protected routes (signed-out or non-admin visitors are redirected to
  `/login`, at both the middleware layer and the database layer)
- Dashboard with real counts: Total Users, Total Owners, Total Cars, Active
  Cars, Total Bookings, Pending/Active Bookings
- Sidebar navigation for every planned section; only **Dashboard** and
  **Audit Logs** are functional — everything else shows a "Coming soon"
  placeholder until its own phase
- Audit log foundation, logging `ADMIN_LOGIN` / `ADMIN_LOGOUT` /
  `ADMIN_LOGIN_FAILED` today

Not implemented yet (by design — see the project's phased plan): promo
codes, campaigns, ads, featured listings, payments, owner payouts, reports/
moderation workflows, chat moderation, catalog management, notifications
management, advanced analytics.

## 1. Database setup (do this once, before first login)

1. Open the Supabase dashboard for the VELORA project → **SQL Editor**.
2. Paste the full contents of
   [`supabase/migrations/0001_admin_foundation.sql`](./supabase/migrations/0001_admin_foundation.sql)
   and run it. This is purely additive — see the comments at the top of
   that file for exactly what it does and does not touch. It does **not**
   modify any existing table, column, or policy used by the mobile app.
3. Grant yourself admin access (the migration intentionally creates no
   admins automatically):
   - Supabase dashboard → **Authentication → Users** → copy your user's
     UUID.
   - Supabase dashboard → **SQL Editor** → run:
     ```sql
     insert into public.admin_users (user_id) values ('<your-user-uuid>');
     ```
   - Use an account that already exists in the VELORA system (sign up via
     the mobile app first if you don't have one, then grant it here).

## 2. Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local — fill in NEXT_PUBLIC_SUPABASE_URL and
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from Supabase dashboard →
# Project Settings → API (same project the mobile app uses)
npm run dev
```

Open http://localhost:3000 — you'll land on `/login`. Sign in with the
account you granted admin access to above.

Useful scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build        # production build
```

## 3. Deploying to Vercel

1. Push this folder to its own Git repository (separate from the mobile
   app's repository).
2. In Vercel: **New Project** → import that repository.
3. Add the environment variables (Project Settings → Environment
   Variables), same two keys as `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Deploy. Vercel's free/Hobby tier is enough to start — you'll get a URL
   like `velora-admin.vercel.app`; a custom domain (e.g. `admin.velora.in`)
   can be attached later from Vercel's Domains settings.

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel's environment
variables (or anywhere in this project). Phase 1 needs no service-role
access at all — see the note in `.env.example`.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same Supabase project URL the mobile app uses. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Same publishable/anon key the mobile app uses. Safe to expose to the browser. |

No other environment variables are used in Phase 1.

## Security model (read this before adding features)

- The client never decides who is an admin. `is_admin()` is a Postgres
  function, evaluated by the database, driven by the `admin_users` table.
- Every table this app reads has RLS enabled. The Phase 1 migration adds
  one new SELECT policy per table (`profiles`, `car_listings`, `bookings`,
  `admin_audit_log`) scoped to `is_admin()`. It never removes or weakens an
  existing policy.
- The Next.js middleware (`middleware.ts` / `lib/supabase/middleware.ts`)
  redirects signed-out visitors before they reach any admin page — but this
  is a UX convenience, not the actual security boundary. The `(admin)`
  route group's layout (`app/(admin)/layout.tsx`) independently calls
  `requireAdmin()` on every request, which re-verifies both "signed in" and
  "is_admin() is true" against the database. Even if both of those were
  somehow bypassed, RLS itself still blocks any query this app makes for a
  non-admin session.
- There is no `SUPABASE_SERVICE_ROLE_KEY` anywhere in this project. Adding
  one in a future phase must be a server-only env var (no `NEXT_PUBLIC_`
  prefix) used only from a server-side route handler — never bundled into
  client code.
- Granting/revoking admin access has no UI in Phase 1 — it's a manual SQL
  Editor / Table Editor step. This is deliberate: no phase-1 code path can
  grant an account admin access, remove one either way, without a human
  acting directly in the Supabase dashboard.

## Project structure

```
app/
  login/                 Public login page
  (admin)/                Protected route group — every page here calls requireAdmin()
    layout.tsx             Sidebar + top bar + the actual auth/admin guard
    dashboard/              Real stats
    audit-logs/              Admin action history
    users/ owners/ cars/ ... "Coming soon" placeholders (Phase 2+)
components/               Sidebar, TopBar, StatCard, ComingSoon, LogoutButton, nav-items
lib/
  supabase/                Browser client, server client, middleware session refresh
  admin.ts                  requireAdmin() — the auth+admin gate
  audit.ts                   logAdminAction() helper
types/database.ts          Hand-written row types for the tables this app reads
supabase/migrations/       SQL for this admin website's own schema additions
```
