import { requireAdmin } from '@/lib/admin';
import { OwnerPayoutsManager, type OwnerBalance, type PayoutRecord } from '@/components/OwnerPayoutsManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawBooking {
  owner_id: string;
  total: number;
}

interface RawPayout {
  id: string;
  owner_id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
}

export default async function OwnerPayoutsPage() {
  const { supabase } = await requireAdmin();

  // owner_payouts needs the table + admin RLS from 0004_admin_phase3.sql.
  // bookings/profiles are already admin-readable (0001_admin_foundation.sql).
  const [{ data: ownerRows }, { data: paidBookingRows }, { data: payoutRows, error: payoutsError }, { data: settingRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'owner'),
    supabase.from('bookings').select('owner_id, total').eq('payment_status', 'paid'),
    supabase
      .from('owner_payouts')
      .select('id, owner_id, period_start, period_end, gross_amount, commission_amount, net_amount, status, paid_at')
      .order('created_at', { ascending: false }),
    supabase.from('app_settings').select('key, value').eq('key', 'platform_commission_percent'),
  ]);

  const ownerNameById = new Map<string, string>();
  for (const o of (ownerRows ?? []) as { id: string; full_name: string | null }[]) {
    ownerNameById.set(o.id, o.full_name ?? 'Unnamed');
  }

  const grossByOwner = new Map<string, number>();
  for (const b of (paidBookingRows ?? []) as RawBooking[]) {
    grossByOwner.set(b.owner_id, (grossByOwner.get(b.owner_id) ?? 0) + b.total);
  }

  const paidOutByOwner = new Map<string, number>();
  for (const p of (payoutRows ?? []) as RawPayout[]) {
    if (p.status === 'paid') paidOutByOwner.set(p.owner_id, (paidOutByOwner.get(p.owner_id) ?? 0) + p.net_amount);
  }

  const balances: OwnerBalance[] = Array.from(ownerNameById.entries())
    .map(([ownerId, ownerName]) => ({
      ownerId,
      ownerName,
      grossPaid: grossByOwner.get(ownerId) ?? 0,
      paidOut: paidOutByOwner.get(ownerId) ?? 0,
    }))
    .filter((b) => b.grossPaid > 0)
    .sort((a, b) => b.grossPaid - a.grossPaid);

  const payouts: PayoutRecord[] = ((payoutRows ?? []) as RawPayout[]).map((p) => ({
    id: p.id,
    ownerId: p.owner_id,
    ownerName: ownerNameById.get(p.owner_id) ?? 'Unknown',
    periodStart: p.period_start,
    periodEnd: p.period_end,
    grossAmount: p.gross_amount,
    commissionAmount: p.commission_amount,
    netAmount: p.net_amount,
    status: p.status,
    paidAt: p.paid_at,
  }));

  const commissionSetting = (settingRows ?? [])[0] as { key: string; value: string } | undefined;
  const commissionPercent = commissionSetting ? Number(commissionSetting.value) : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Owner Payouts</h1>
        <LiveBadge tables={['owner_payouts', 'bookings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">
        What each owner has earned from paid bookings, and a manual ledger of what&apos;s actually been paid out.
      </p>

      {payoutsError && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load payout history. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!payoutsError && (
        <OwnerPayoutsManager
          balances={balances}
          payouts={payouts}
          commissionPercent={commissionPercent !== null && !Number.isNaN(commissionPercent) ? commissionPercent : null}
        />
      )}
    </div>
  );
}
