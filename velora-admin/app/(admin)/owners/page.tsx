import { requireAdmin } from '@/lib/admin';
import { UsersTable, type UserRow } from '@/components/UsersTable';
import { LiveBadge } from '@/components/LiveBadge';
import type { ProfileRow } from '@/types/database';

export default async function OwnersPage() {
  const { supabase } = await requireAdmin();

  // Two small, separate queries rather than one PostgREST join+group-by --
  // matches the dashboard's own safeCount philosophy (simple, independently
  // failing queries over a single fragile aggregate one). Both are already
  // covered by existing RLS (profiles_select_admin, car_listings_select_admin)
  // -- no new migration needed for this section.
  const [{ data: ownerRows, error: ownersError }, { data: carRows, error: carsError }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, role').eq('role', 'owner'),
    supabase.from('car_listings').select('owner_id'),
  ]);

  const carCountByOwner = new Map<string, number>();
  if (!carsError) {
    for (const row of (carRows ?? []) as { owner_id: string }[]) {
      carCountByOwner.set(row.owner_id, (carCountByOwner.get(row.owner_id) ?? 0) + 1);
    }
  }

  const rows: UserRow[] = ((ownerRows ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    fullName: p.full_name ?? '',
    avatarUrl: p.avatar_url,
    role: p.role ?? 'owner',
    extra: { label: 'Cars listed', value: String(carCountByOwner.get(p.id) ?? 0) },
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Owners</h1>
        <LiveBadge tables={['profiles', 'car_listings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Every account currently in Owner mode.</p>

      {ownersError && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load owners.
        </div>
      )}

      {!ownersError && <UsersTable rows={rows} extraColumnLabel="Cars listed" />}
    </div>
  );
}
