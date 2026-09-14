'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface BrandRow {
  id: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface ModelRow {
  id: string;
  brandId: string;
  name: string;
  bodyType: string | null;
  fuelType: string | null;
  transmission: string | null;
  seats: number | null;
  isActive: boolean;
  isCustom: boolean;
}

// Slug used as brands.id -- lowercase, hyphenated, matches the existing
// seed convention in 0001_catalog_foundation.sql (e.g. 'land-rover').
const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const BrandsModelsManager = ({ brands, models }: { brands: BrandRow[]; models: ModelRow[] }) => {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?.id ?? '');
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const modelsForBrand = useMemo(
    () => models.filter((m) => m.brandId === selectedBrandId).sort((a, b) => Number(b.isCustom) - Number(a.isCustom)),
    [models, selectedBrandId],
  );
  const pendingCountByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of models) {
      if (m.isCustom && !m.isActive) map.set(m.brandId, (map.get(m.brandId) ?? 0) + 1);
    }
    return map;
  }, [models]);

  const run = async (key: string, fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(key);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    setBusy(null);
    router.refresh();
  };

  const toggleBrandActive = (brand: BrandRow) =>
    run(`brand-${brand.id}`, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('brands').update({ is_active: !brand.isActive }).eq('id', brand.id);
    });

  const addBrand = async () => {
    if (!newBrandName.trim()) return;
    const id = slugify(newBrandName);
    await run('add-brand', async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase
        .from('brands')
        .insert({ id, name: newBrandName.trim(), logo_url: newBrandLogo.trim() || null, display_order: brands.length * 10 + 10 });
    });
    setNewBrandName('');
    setNewBrandLogo('');
  };

  const approveModel = (model: ModelRow) =>
    run(`model-${model.id}`, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('car_models').update({ is_active: true }).eq('id', model.id);
    });

  const rejectModel = (model: ModelRow) =>
    run(`model-${model.id}`, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('car_models').delete().eq('id', model.id);
    });

  const toggleModelActive = (model: ModelRow) =>
    run(`model-${model.id}`, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('car_models').update({ is_active: !model.isActive }).eq('id', model.id);
    });

  const addModel = async () => {
    if (!newModelName.trim() || !selectedBrandId) return;
    await run('add-model', async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('car_models').insert({
        brand_id: selectedBrandId,
        name: newModelName.trim(),
        is_custom: false,
        is_active: true,
        display_order: modelsForBrand.length * 10 + 10,
      });
    });
    setNewModelName('');
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold text-velora-black">Brands</h2>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-velora-black/60">New brand name</label>
            <input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="e.g. Skoda"
              className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-velora-black/60">Logo URL (optional)</label>
            <input
              value={newBrandLogo}
              onChange={(e) => setNewBrandLogo(e.target.value)}
              placeholder="https://..."
              className="w-64 rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
            />
          </div>
          <button
            onClick={addBrand}
            disabled={!newBrandName.trim() || busy === 'add-brand'}
            className="rounded-lg bg-velora-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-velora-charcoal disabled:opacity-60"
          >
            {busy === 'add-brand' ? 'Adding…' : 'Add brand'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-velora-border text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-3 py-2 font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Pending models</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-velora-border last:border-0">
                  <td className="px-3 py-2 font-medium text-velora-black">{b.name}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-velora-border text-velora-black/60'}`}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-velora-black/60">{pendingCountByBrand.get(b.id) ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleBrandActive(b)}
                      disabled={busy === `brand-${b.id}`}
                      className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                    >
                      {b.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-velora-black">Models</h2>
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {pendingCountByBrand.get(b.id) ? ` (${pendingCountByBrand.get(b.id)} pending)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-velora-black/60">New model name (for this brand)</label>
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="e.g. Octavia"
              className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
            />
          </div>
          <button
            onClick={addModel}
            disabled={!newModelName.trim() || busy === 'add-model'}
            className="rounded-lg bg-velora-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-velora-charcoal disabled:opacity-60"
          >
            {busy === 'add-model' ? 'Adding…' : 'Add model'}
          </button>
        </div>

        {modelsForBrand.length === 0 ? (
          <div className="py-10 text-center text-sm text-velora-black/40">No models for this brand yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-velora-border text-xs uppercase tracking-wide text-velora-black/45">
                <tr>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {modelsForBrand.map((m) => (
                  <tr key={m.id} className="border-b border-velora-border last:border-0">
                    <td className="px-3 py-2 font-medium text-velora-black">{m.name}</td>
                    <td className="px-3 py-2">
                      {m.isCustom && !m.isActive ? (
                        <span className="badge bg-amber-100 text-amber-700">Pending review</span>
                      ) : (
                        <span className={`badge ${m.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-velora-border text-velora-black/60'}`}>
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.isCustom && !m.isActive ? (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => approveModel(m)}
                            disabled={busy === `model-${m.id}`}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectModel(m)}
                            disabled={busy === `model-${m.id}`}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleModelActive(m)}
                          disabled={busy === `model-${m.id}`}
                          className="rounded-lg border border-velora-border px-3 py-1 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
                        >
                          {m.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
