'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client, for use inside Client Components only (the
// login form, the logout button). Server Components/Route Handlers/
// middleware must use lib/supabase/server.ts instead — they need the
// request's cookies, which this browser client has no access to.
export const createSupabaseBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable.');

  return createBrowserClient(url, key);
};
