import { requireAdmin } from '@/lib/admin';
import { PaymentsLedger, type PaymentRow } from '@/components/PaymentsLedger';
import { LiveBadge } from '@/components/LiveBadge';

interface RawBookingPayment {
  id: string;
  renter_name: string | null;
  owner_id: string;
  payment_status: string;
  payment_method: string | null;
  payment_transaction_id: string | null;
  total: number;
  paid_at: string | null;
  created_at: string;
}

export default async function PaymentsPage() {
  const { supabase } = await requireAdmin();

  // No new table -- reads payment_status/payment_method/
  // payment_transaction_id/total/paid_at, already on `bookings` since
  // supabase_migration_multidevice.sql. Already covered by the existing
  // bookings_select_admin policy (0001_admin_foundation.sql), so this
  // section works today without any new migration.
  //
  // This is a LEDGER, not a processor: VELORA has no payment gateway
  // integrated, so nothing here charges, refunds, or verifies a payment --
  // it only shows what each booking's payment_status already says.
  const [{ data: bookingRows, error }, { data: ownerRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, renter_name, owner_id, payment_status, payment_method, payment_transaction_id, total, paid_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const ownerNameById = new Map<string, string>();
  for (const p of (ownerRows ?? []) as { id: string; full_name: string | null }[]) {
    ownerNameById.set(p.id, p.full_name ?? 'Unnamed');
  }

  const rows: PaymentRow[] = ((bookingRows ?? []) as RawBookingPayment[]).map((b) => ({
    bookingId: b.id,
    renterName: b.renter_name ?? 'Unknown',
    ownerName: ownerNameById.get(b.owner_id) ?? 'Unknown',
    paymentStatus: b.payment_status,
    paymentMethod: b.payment_method,
    transactionId: b.payment_transaction_id,
    total: b.total,
    paidAt: b.paid_at,
    createdAt: b.created_at,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Payments</h1>
        <LiveBadge tables={['bookings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">
        Payment status per booking. VELORA has no payment gateway wired in yet — this is a read-only ledger, not a processor.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Couldn&apos;t load payments.</div>
      )}

      {!error && <PaymentsLedger rows={rows} />}
    </div>
  );
}
