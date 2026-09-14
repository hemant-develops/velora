'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdminAction } from '@/lib/audit';

export const LogoutButton = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    // Must log BEFORE signOut() -- once the session ends, auth.uid() no
    // longer resolves and the insert's RLS check (admin_id = auth.uid())
    // can't pass. Same ordering constraint as the mobile app's push-token
    // clear-on-logout (src/context/AuthContext.tsx logout()).
    await logAdminAction(supabase, { action: 'ADMIN_LOGOUT' }).catch(() => undefined);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="rounded-lg border border-velora-border px-3 py-1.5 text-sm font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
    >
      {loading ? 'Signing out…' : 'Log out'}
    </button>
  );
};
