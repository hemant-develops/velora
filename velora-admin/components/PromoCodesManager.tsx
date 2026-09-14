'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface PromoCodeRow {
  id: string;
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

const formatDiscount = (r: PromoCodeRow) => (r.discountType === 'percent' ? `${r.discountValue}% off` : `₹${r.discountValue} off`);

// Management only -- these codes aren't wired into the mobile app's
// checkout flow yet (BookingsContext has no promo/discount step today), so
// creating a code here doesn't yet let a renter redeem it. This gives you
// the codes ready to go the moment that redemption step is built.
export const PromoCodesManager = ({ rows: initialRows }: { rows: PromoCodeRow[] }) => {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
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

  const addCode = () => {
    const trimmedCode = code.trim().toUpperCase();
    const value = Number(discountValue);
    if (!trimmedCode || !value || value <= 0) {
      setError('Code and a positive discount value are required.');
      return;
    }
    run('new', async () => {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.from('promo_codes').insert({
        code: trimmedCode,
        discount_type: discountType,
        discount_value: value,
        max_uses: maxUses.trim() ? Number(maxUses) : null,
        expires_at: expiresAt || null,
      });
      if (!result.error) {
        setCode('');
        setDiscountValue('');
        setMaxUses('');
        setExpiresAt('');
      }
      return result;
    });
  };

  const toggleActive = (row: PromoCodeRow) => {
    run(row.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('promo_codes').update({ is_active: !row.isActive }).eq('id', row.id);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">New promo code</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          <input
            type="text"
            placeholder="CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm uppercase outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as 'percent' | 'flat')}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            <option value="percent">% off</option>
            <option value="flat">₹ off</option>
          </select>
          <input
            type="number"
            placeholder="Value"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="number"
            placeholder="Max uses (optional)"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>
        <button
          onClick={addCode}
          disabled={busyId === 'new'}
          className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
        >
          Create code
        </button>
      </div>

      {initialRows.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No promo codes yet.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Uses</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {initialRows.map((r) => (
                <tr key={r.id} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3 font-mono font-medium text-velora-black">{r.code}</td>
                  <td className="px-4 py-3 text-velora-black/70">{formatDiscount(r)}</td>
                  <td className="px-4 py-3 text-velora-black/70">
                    {r.usedCount}
                    {r.maxUses ? ` / ${r.maxUses}` : ''}
                  </td>
                  <td className="px-4 py-3 text-velora-black/70">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-velora-border text-velora-black/60'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                    >
                      {r.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
