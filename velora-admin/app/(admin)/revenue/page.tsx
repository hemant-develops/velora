import { requireAdmin } from '@/lib/admin';
import { StatCard } from '@/components/StatCard';
import { LiveBadge } from '@/components/LiveBadge';

interface RawBooking {
  total: number;
  payment_status: string;
  status: string;
  created_at: string;
}

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// No new table -- reads `bookings` (already admin-readable since
// 0001_admin_foundation.sql) and, if set, app_settings.platform_commission_percent
// (0004_admin_phase3.sql, via Settings) to estimate commission earned.
// Revenue = sum of `total` on bookings with payment_status = 'paid' --
// same definition Payments and Owner Payouts use, so the three sections
// agree with each other.
export default async function RevenuePage() {
  const { supabase } = await requireAdmin();

  const [{ data: bookingRows, error }, { data: settingRows }] = await Promise.all([
    supabase.from('bookings').select('total, payment_status, status, created_at').limit(2000),
    supabase.from('app_settings').select('key, value').eq('key', 'platform_commission_percent'),
  ]);

  const bookings = (bookingRows ?? []) as RawBooking[];
  const paid = bookings.filter((b) => b.payment_status === 'paid');
  const totalRevenue = paid.reduce((sum, b) => sum + b.total, 0);
  const cancelledCount = bookings.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length;

  const commissionSetting = (settingRows ?? [])[0] as { key: string; value: string } | undefined;
  const commissionPercent = commissionSetting ? Number(commissionSetting.value) : null;
  const commissionEarned =
    commissionPercent !== null && !Number.isNaN(commissionPercent) ? Math.round((totalRevenue * commissionPercent) / 100) : null;

  const monthly = new Map<string, { revenue: number; bookings: number }>();
  for (const b of paid) {
    const month = b.created_at.slice(0, 7); // YYYY-MM
    const entry = monthly.get(month) ?? { revenue: 0, bookings: 0 };
    entry.revenue += b.total;
    entry.bookings += 1;
    monthly.set(month, entry);
  }
  const monthlyRows = Array.from(monthly.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Revenue</h1>
        <LiveBadge tables={['bookings', 'app_settings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Revenue from paid bookings, and estimated platform commission.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Couldn&apos;t load revenue data.</div>
      )}

      {!error && (
        <>
          {commissionPercent === null && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No <code className="rounded bg-amber-100 px-1 py-0.5">platform_commission_percent</code> set in Settings — add it to see estimated commission earned.
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
            <StatCard label="Paid Bookings" value={paid.length} />
            <StatCard label="Cancelled / Rejected" value={cancelledCount} />
            <StatCard
              label="Commission Earned"
              value={commissionEarned !== null ? formatCurrency(commissionEarned) : null}
              hint={commissionEarned !== null ? `at ${commissionPercent}%` : 'Set commission % in Settings'}
            />
          </div>

          <h2 className="mb-3 text-sm font-semibold text-velora-black">By month</h2>
          {monthlyRows.length === 0 ? (
            <div className="card py-10 text-center text-sm text-velora-black/40">No paid bookings yet.</div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Month</th>
                    <th className="px-4 py-3 font-medium">Paid bookings</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map(([month, entry]) => (
                    <tr key={month} className="border-b border-velora-border last:border-0">
                      <td className="px-4 py-3 text-velora-black/70">{month}</td>
                      <td className="px-4 py-3 text-velora-black/70">{entry.bookings}</td>
                      <td className="px-4 py-3 font-medium text-velora-black">{formatCurrency(entry.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
