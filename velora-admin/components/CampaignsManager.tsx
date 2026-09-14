'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface CampaignRow {
  id: string;
  name: string;
  goal: string | null;
  promoCodeLabel: string | null;
  adLabel: string | null;
  isActive: boolean;
}

export interface PromoOption {
  id: string;
  label: string;
}

export interface AdOption {
  id: string;
  label: string;
}

// A campaign is an ORCHESTRATION layer, not a third discount/creative
// system: it groups an optional promo code + an optional ad under one
// named push with a goal, so Promo Codes and Ads stay the single source of
// truth for the actual discount/creative, and this just tracks "why" and
// "together with what."
export const CampaignsManager = ({
  rows,
  promoOptions,
  adOptions,
}: {
  rows: CampaignRow[];
  promoOptions: PromoOption[];
  adOptions: AdOption[];
}) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [promoCodeId, setPromoCodeId] = useState('');
  const [adId, setAdId] = useState('');
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

  const addCampaign = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    run('new', async () => {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.from('campaigns').insert({
        name: trimmedName,
        goal: goal.trim() || null,
        promo_code_id: promoCodeId || null,
        ad_id: adId || null,
      });
      if (!result.error) {
        setName('');
        setGoal('');
        setPromoCodeId('');
        setAdId('');
      }
      return result;
    });
  };

  const toggleActive = (row: CampaignRow) => {
    run(row.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('campaigns').update({ is_active: !row.isActive }).eq('id', row.id);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">New campaign</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Name (e.g. Diwali Weekend Push)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="text"
            placeholder="Goal (optional)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <select
            value={promoCodeId}
            onChange={(e) => setPromoCodeId(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            <option value="">No promo code</option>
            {promoOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={adId}
            onChange={(e) => setAdId(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            <option value="">No ad</option>
            {adOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={addCampaign}
          disabled={busyId === 'new'}
          className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
        >
          Create campaign
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No campaigns yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-velora-black">{r.name}</div>
                  {r.goal && <p className="mt-0.5 text-xs text-velora-black/50">{r.goal}</p>}
                  <p className="mt-1 text-xs text-velora-black/40">
                    {r.promoCodeLabel ? `Promo: ${r.promoCodeLabel}` : 'No promo code'} · {r.adLabel ? `Ad: ${r.adLabel}` : 'No ad'}
                  </p>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
