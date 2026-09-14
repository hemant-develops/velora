import { requireAdmin } from '@/lib/admin';
import { StatCard } from '@/components/StatCard';
import { LiveBadge } from '@/components/LiveBadge';

// Runs one `count: 'exact', head: true` query per stat -- these return only
// a row count, never the underlying rows, and are cheap. Each is wrapped so
// one failing query (e.g. the migration hasn't been run yet, so the
// admin-read RLS policy doesn't exist) can't take the other cards down with
// it -- that card just shows "Unavailable" instead of a fabricated number.
const safeCount = async (query: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
  const { count, error } = await query;
  if (error) {
    console.error('VELORA_ADMIN_DASHBOARD_COUNT_ERROR:', error.message);
    return null;
  }
  return count ?? 0;
};

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();

  const [totalUsers, totalOwners, totalCars, activeCars, totalBookings, activeBookings] = await Promise.all([
    safeCount(supabase.from('profiles').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'owner')),
    safeCount(supabase.from('car_listings').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('car_listings').select('*', { count: 'exact', head: true }).eq('is_active', true)),
    safeCount(supabase.from('bookings').select('*', { count: 'exact', head: true })),
    safeCount(
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['pending', 'upcoming', 'active']),
    ),
  ]);

  const anyUnavailable = [totalUsers, totalOwners, totalCars, activeCars, totalBookings, activeBookings].some(
    (v) => v === null,
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Dashboard</h1>
        <LiveBadge tables={['profiles', 'car_listings', 'bookings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Live counts from the VELORA database.</p>

      {anyUnavailable && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          One or more stats couldn&apos;t be loaded. This usually means the admin database migration
          (<code className="rounded bg-amber-100 px-1 py-0.5">supabase/migrations/0001_admin_foundation.sql</code>)
          hasn&apos;t been run yet, or this account isn&apos;t in <code className="rounded bg-amber-100 px-1 py-0.5">admin_users</code>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Total Owners" value={totalOwners} />
        <StatCard label="Total Cars" value={totalCars} />
        <StatCard label="Active Cars" value={activeCars} hint="Visible to renters" />
        <StatCard label="Total Bookings" value={totalBookings} />
        <StatCard label="Pending / Active Bookings" value={activeBookings} hint="pending, upcoming, or active" />
      </div>
    </div>
  );
}
