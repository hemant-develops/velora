import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Server-side, session-aware Supabase client for Server Components/Route
// Handlers (the account page, the OAuth callback route, SiteHeader's
// signed-in check). Always the anon key -- exactly like the mobile app and
// velora-admin, this site never holds a service-role key; access is
// enforced by RLS, scoped to whichever session's cookie is present.
//
// Returns null instead of throwing when unconfigured -- SiteHeader calls
// this on EVERY page via the root layout, so throwing here would take down
// the entire site on a missing env var instead of just the auth-dependent
// bits degrading gracefully (same isSupabaseConfigured pattern lib/supabase.ts
// already uses for the public data-fetching pages).
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where Next.js disallows writing
          // cookies -- middleware.ts is what actually persists/refreshes the
          // session cookie on every request, so a Server Component that only
          // reads the session doesn't need this write to succeed.
        }
      },
    },
  });
};
