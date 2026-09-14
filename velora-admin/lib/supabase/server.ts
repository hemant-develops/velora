import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// TYPE-FIX NOTE -- see the matching comment in lib/supabase/middleware.ts:
// the `setAll` parameter is typed explicitly here for the same reason
// (a broken deep-import inside @supabase/ssr@0.5.2's own .d.ts, silently
// widened to `any` under skipLibCheck, was making `cookiesToSet` implicitly
// `any`). `CookieOptions` comes straight from @supabase/ssr's own ./types
// module, unaffected by that broken import chain.

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. Reads/writes the session via Next.js's request cookies,
// which is what lets an admin's login survive across requests without ever
// putting a session token in client-readable storage that a script could
// exfiltrate.
//
// IMPORTANT: this always uses the PUBLISHABLE (anon) key — the same key the
// browser client and the mobile app use. It is never the service-role key.
// Every query made with this client is therefore still subject to RLS,
// scoped to whichever user's session cookie is present. That is the whole
// point: admin data access is enforced by the database (is_admin() + the
// admin-scoped RLS policies added in supabase/migrations), not by this
// file trusting anything about the caller.
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable.');

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll can be called from a Server Component (not just a Route
          // Handler/Server Action), where Next.js disallows writing cookies.
          // Safe to ignore here: middleware.ts (below) is what actually
          // refreshes/persists the session cookie on every request, so a
          // Server Component that only reads the session doesn't need this
          // write to succeed.
        }
      },
    },
  });
};
