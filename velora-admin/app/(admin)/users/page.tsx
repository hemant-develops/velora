import { requireAdmin } from '@/lib/admin';
import { UsersTable, type UserRow } from '@/components/UsersTable';
import { LiveBadge } from '@/components/LiveBadge';
import type { ProfileRow } from '@/types/database';

export default async function UsersPage() {
  const { supabase } = await requireAdmin();

  // profiles_select_admin RLS (0001_admin_foundation.sql) grants this
  // exactly the same read every other admin page relies on -- no new
  // migration needed for this section.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .order('full_name', { ascending: true, nullsFirst: false });

  const rows: UserRow[] = ((data ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    fullName: p.full_name ?? '',
    avatarUrl: p.avatar_url,
    role: p.role ?? 'customer',
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Users</h1>
        <LiveBadge tables={['profiles']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Every VELORA account (renters and owners).</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load users.
        </div>
      )}

      {!error && <UsersTable rows={rows} />}
    </div>
  );
}
