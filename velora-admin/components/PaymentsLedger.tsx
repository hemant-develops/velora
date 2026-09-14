'use client';

import { useMemo, useState } from 'react';

export interface PaymentRow {
  bookingId: string;
  renterName: string;
  ownerName: string;
  paymentStatus: string;
  paymentMethod: string | null;
  transactionId: string | null;
  total: number;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = ['all', 'unpaid', 'processing', 'paid', 'failed'] as const;

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-velora-border text-velora-black/60',
  failed: 'bg-red-100 text-red-700',
};

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// Read-only: reads the payment_status/payment_method/payment_transaction_id
// columns that already exist on `bookings` (see
// supabase_migration_multidevice.sql). There's no payment gateway
// integrated yet, so this is a ledger of what bookings SAY their payment
// state is (set by whatever manual/offline process VELORA currently uses),
// not a live processor -- no charge/refund actions live here.
export const PaymentsLedger = ({ rows }: { rows: PaymentRow[] }) => {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.paymentStatus !== status) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return r.renterName.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q) || r.bookingId.toLowerCase().includes(q);
    });
  }, [rows, status, query]);

  const totalPaid = filtered.filter((r) => r.paymentStatus === 'paid').reduce((sum, r) => sum + r.total, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by renter, owner, or booking ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])}
          className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s}
            </option>
          ))}
        </select>
        <span className="text-xs text-velora-black/45">
          {filtered.length} bookings · {formatCurrency(totalPaid)} paid
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No payments match.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Renter</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.bookingId} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-velora-black/60">{r.bookingId}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.renterName}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.ownerName}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.paymentMethod ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-velora-black">{formatCurrency(r.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_BADGE[r.paymentStatus] ?? 'bg-velora-border text-velora-black/60'}`}>{r.paymentStatus}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-velora-black/45">{r.paidAt ? formatWhen(r.paidAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
