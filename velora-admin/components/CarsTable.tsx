'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface CarRow {
  id: string;
  name: string;
  brandName: string;
  ownerName: string;
  category: string;
  pricePerDay: number;
  quantity: number;
  isActive: boolean;
}

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const CarsTable = ({ rows }: { rows: CarRow[] }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q));
  }, [rows, query]);

  const toggleActive = async (row: CarRow) => {
    setBusyId(row.id);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    // Needs car_listings_update_admin (0002_admin_phase2.sql) -- admin only
    // had SELECT on car_listings before this.
    const { error: err } = await supabase.from('car_listings').update({ is_active: !row.isActive }).eq('id', row.id);
    if (err) setError(err.message);
    setBusyId(null);
    router.refresh();
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search by car, brand, or owner..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No cars match.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Car</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Price/day</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-velora-black">{r.name}</div>
                    <div className="text-xs text-velora-black/45">{r.brandName}</div>
                  </td>
                  <td className="px-4 py-3 text-velora-black/70">{r.ownerName}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.category}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-velora-black/70">{formatCurrency(r.pricePerDay)}</td>
                  <td className="px-4 py-3 text-velora-black/70">{r.quantity}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-velora-border text-velora-black/60'}`}>
                      {r.isActive ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                    >
                      {r.isActive ? 'Hide' : 'Unhide'}
                    </button>
                  </td>
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
