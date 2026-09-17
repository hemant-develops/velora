'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser-side, session-aware Supabase client -- for Client Components that
// need the signed-in visitor's own session (login form, account page,
// logout button). Server Components/middleware must use
// supabaseServerClient.ts instead (it needs the request's cookies, which
// this browser client has no access to). Distinct from lib/supabase.ts,
// which is the plain, no-session anon client every public data-fetching
// page (search, car pages, owner pages) already used before login existed
// -- those never needed cookies and still don't.
export const createSupabaseBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
};
