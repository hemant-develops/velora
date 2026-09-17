'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';

export const LogoutButton: React.FC = () => {
  const router = useRouter();
  const onLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };
  return (
    <button type="button" onClick={onLogout} className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
      Logout
    </button>
  );
};
