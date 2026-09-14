'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface OwnerBalance {
  ownerId: string;
  ownerName: string;
  grossPaid: number;
  paidOut: number;
}

export interface PayoutRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  status: 'pending' | 'paid';
  paidAt: string | null;
}

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// commissionPercent is read from app_settings.platform_commission_percent
// (Settings section) -- null here means that key hasn't been set yet, so
// commission/net can't be computed and this shows gross only.
//
// A "payout" recorded here is a MANUAL ledger entry: VELORA has no payout
// API integrated, so an admin pays the owner by bank transfer outside the
// app and then records it here as paid. Nothing on this page moves money.
export const OwnerPayoutsManager = ({
  balances,
  payouts,
  commissionPercent,
}: {
  balances: OwnerBalance[];
  payouts: PayoutRecord[];
  commissionPercent: number | null;
}) => {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(balances[0]?.ownerId ?? '');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusyId(id);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    setBusyId(null);
    router.refresh();
  };

  const preview = useMemo(() => {
    const gross = Number(grossAmount) || 0;
    const commission = commissionPercent !== null ? Math.round((gross * commissionPercent) / 100) : 0;
    return { gross, commission, net: gross - commission };
  }, [grossAmount, commissionPercent]);

  const recordPayout = () => {
    const gross = Number(grossAmount);
    if (!ownerId || !periodStart || !periodEnd || !gross || gross <= 0) {
      setError('Owner, period, and a positive gross amount are required.');
      return;
    }
    run('new', async () => {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.from('owner_payouts').insert({
        owner_id: ownerId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: preview.gross,
        commission_amount: preview.commission,
        net_amount: preview.net,
        notes: notes.trim() || null,
      });
      if (!result.error) {
        setPeriodStart('');
        setPeriodEnd('');
        setGrossAmount('');
        setNotes('');
      }
      return result;
    });
  };

  const markPaid = (payout: PayoutRecord) => {
    run(payout.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('owner_payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payout.id);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {commissionPercent === null && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No <code className="rounded bg-amber-100 px-1 py-0.5">platform_commission_percent</code> set in Settings — commission shows as ₹0 until you add it.
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-velora-black">Owner balances</h2>
      {balances.length === 0 ? (
        <div className="card mb-6 py-10 text-center text-sm text-velora-black/40">No owners with paid bookings yet.</div>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Gross (paid bookings)</th>
                <th className="px-4 py-3 font-medium">Already paid out</th>
                <th className="px-4 py-3 font-medium">Outstanding (gross)</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.ownerId} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3 font-medium text-velora-black">{b.ownerName}</td>
                  <td className="px-4 py-3 text-velora-black/70">{formatCurrency(b.grossPaid)}</td>
                  <td className="px-4 py-3 text-velora-black/70">{formatCurrency(b.paidOut)}</td>
                  <td className="px-4 py-3 font-medium text-velora-black">{formatCurrency(Math.max(0, b.grossPaid - b.paidOut))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">Record a payout</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            {balances.map((b) => (
              <option key={b.ownerId} value={b.ownerId}>
                {b.ownerName}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="number"
            placeholder="Gross amount ₹"
            value={grossAmount}
            onChange={(e) => setGrossAmount(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-3 w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        />
        {Number(grossAmount) > 0 && (
          <p className="mt-2 text-xs text-velora-black/50">
            Commission {formatCurrency(preview.commission)} · Net to pay {formatCurrency(preview.net)}
          </p>
        )}
        <button
          onClick={recordPayout}
          disabled={busyId === 'new'}
          className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
        >
          Record as pending
        </button>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-velora-black">Payout history</h2>
      {payouts.length === 0 ? (
        <div className="card py-10 text-center text-sm text-velora-black/40">No payouts recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-velora-black">{p.ownerName}</div>
                <div className="text-xs text-velora-black/45">
                  {p.periodStart} → {p.periodEnd} · Net {formatCurrency(p.netAmount)} (gross {formatCurrency(p.grossAmount)}, commission {formatCurrency(p.commissionAmount)})
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {p.status === 'paid' ? 'Paid' : 'Pending'}
                </span>
                {p.status === 'pending' && (
                  <button
                    onClick={() => markPaid(p)}
                    disabled={busyId === p.id}
                    className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                  >
                    Mark paid
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
