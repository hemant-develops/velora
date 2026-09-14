'use client';

import { useMemo, useState } from 'react';

export interface BookingRow {
  id: string;
  carName: string;
  renterName: string;
  status: string;
  paymentStatus: string;
  pickupDate: string;
  dropoffDate: string;
  total: number;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  upcoming: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-velora-border text-velora-black/60',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
};

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_OPTIONS = ['all', 'pending', 'upcoming', 'active', 'completed', 'cancelled', 'rejected'];

const formatShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const BookingsTable = ({ rows }: { rows: BookingRow[] }) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return r.carName.toLowerCase().includes(q) || r.renterName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    });
  }, [rows, query, status]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by car, renter, or booking ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No bookings match.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Booked</th>
                <th className="px-4 py-3 font-medium">Car</th>
                <th className="px-4 py-3 font-medium">Renter</th>
                <th className="px-4 py-3 font-medium">Trip dates</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-velora-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-velora-black/60">{formatShort(r.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-velora-black">{r.carName}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.renterName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-velora-black/70">
                    {formatShort(r.pickupDate)} → {formatShort(r.dropoffDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_BADGE[r.status] ?? 'bg-velora-border text-velora-black/60'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${PAYMENT_BADGE[r.paymentStatus] ?? 'bg-velora-border text-velora-black/60'}`}>
                      {r.paymentStatus}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-velora-black">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-velora-black/40">
        {filtered.length} of {rows.length}
      </p>
    </div>
  );
};
