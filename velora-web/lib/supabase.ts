import { createClient } from '@supabase/supabase-js';

// This site has no login of its own -- every visitor is anonymous, and every
// query here uses the anon (publishable) key only. What it can actually read
// is enforced entirely by Postgres RLS (see
// supabase/migrations/0025_public_website_read_access.sql in the main repo),
// never by anything in this file -- there is no service-role key anywhere in
// this project, and there never should be.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// A missing env var must never crash the whole site for every visitor --
// pages that need data check `isSupabaseConfigured` first and render a clear
// "temporarily unavailable" state instead (see lib/queries.ts).
export const isSupabaseConfigured = !!url && !!key;

export const supabase = createClient(url ?? 'https://placeholder.invalid', key ?? 'placeholder', {
  auth: { persistSession: false },
});
