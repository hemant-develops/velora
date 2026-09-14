'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface FeaturedRow {
  id: string;
  carId: string;
  carName: string;
  displayOrder: number;
  isActive: boolean;
}

export interface CarOption {
  id: string;
  name: string;
}

// Management only -- the mobile Home screen doesn't render a "Featured"
// rail today, so featuring a car here doesn't change what renters see yet.
// This gets the ordering/scheduling ready for whenever that rail is built.
export const FeaturedListingsManager = ({ rows, carOptions }: { rows: FeaturedRow[]; carOptions: CarOption[] }) => {
  const router = useRouter();
  const [carId, setCarId] = useState(carOptions[0]?.id ?? '');
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

  const addFeatured = () => {
    if (!carId) {
      setError('Pick a car.');
      return;
    }
    run('new', async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('featured_listings').insert({ car_id: carId, display_order: rows.length * 10 + 10 });
    });
  };

  const toggleActive = (row: FeaturedRow) => {
    run(row.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('featured_listings').update({ is_active: !row.isActive }).eq('id', row.id);
    });
  };

  const remove = (row: FeaturedRow) => {
    run(row.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('featured_listings').delete().eq('id', row.id);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">Feature a car</h2>
        <div className="flex flex-wrap gap-3">
          <select
            value={carId}
            onChange={(e) => setCarId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            {carOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={addFeatured}
            disabled={busyId === 'new' || !carId}
            className="rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No featured listings yet.</div>
      ) : (
        <div className="space-y-2">
          {rows
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-velora-black">{r.carName}</span>
                  <span className="ml-2 text-xs text-velora-black/40">order {r.displayOrder}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-velora-border text-velora-black/60'}`}>
                    {r.isActive ? 'Active' : 'Paused'}
                  </span>
                  <button
                    onClick={() => toggleActive(r)}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                  >
                    {r.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => remove(r)}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
