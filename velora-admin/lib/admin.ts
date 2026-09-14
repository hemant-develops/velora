import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase/server';

export interface AdminSession {
  userId: string;
  email: string;
  supabase: SupabaseClient;
}

// The single place that decides "is the current visitor allowed to see
// admin pages." Called at the top of the (admin) layout, so every route
// under it is covered without repeating this in each page.
//
// This is a SERVER-side check using the signed-in user's own session
// (anon/publishable key + their cookie-backed access token) calling the
// is_admin() SQL function added in supabase/migrations/0001_admin_foundation.sql.
// That function is itself backed by RLS on admin_users, so this can't be
// fooled by anything the client sends — there is no client input here at
// all besides "who is currently authenticated."
//
// Two ways this can end without an AdminSession: not signed in at all
// (already redirected to /login by middleware, but re-checked here in case
// middleware's matcher is ever changed), or signed in but not in
// admin_users -- both redirect to /login rather than leaking a "you're not
// an admin" page that would confirm to a stranger that admin URLs exist.
export const requireAdmin = async (): Promise<AdminSession> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_admin');

  if (adminCheckError) {
    // Fail closed: a broken/unreachable admin check must never be treated
    // as "allowed."
    console.error('VELORA_ADMIN_IS_ADMIN_RPC_ERROR:', adminCheckError.message);
    redirect('/login?error=admin_check_failed');
  }

  if (!isAdmin) {
    redirect('/login?error=not_admin');
  }

  return { userId: user.id, email: user.email ?? '', supabase };
};
