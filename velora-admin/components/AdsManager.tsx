'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface AdRow {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  placement: string;
  isActive: boolean;
}

// Management only -- the mobile app has no ad-slot rendering yet. This
// gets creatives ready to go the moment a placement is built to show them.
export const AdsManager = ({ rows }: { rows: AdRow[] }) => {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [placement, setPlacement] = useState('home_banner');
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

  const addAd = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    run('new', async () => {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.from('ads').insert({
        title: trimmedTitle,
        image_url: imageUrl.trim() || null,
        link_url: linkUrl.trim() || null,
        placement,
      });
      if (!result.error) {
        setTitle('');
        setImageUrl('');
        setLinkUrl('');
      }
      return result;
    });
  };

  const toggleActive = (row: AdRow) => {
    run(row.id, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('ads').update({ is_active: !row.isActive }).eq('id', row.id);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">New ad</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <select
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            <option value="home_banner">Home banner</option>
            <option value="search_results">Search results</option>
            <option value="car_details">Car details</option>
          </select>
          <input
            type="text"
            placeholder="Image URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="text"
            placeholder="Link URL (optional)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>
        <button
          onClick={addAd}
          disabled={busyId === 'new'}
          className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
        >
          Create ad
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No ads yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {r.imageUrl && <img src={r.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />}
                <div>
                  <div className="font-medium text-velora-black">{r.title}</div>
                  <div className="text-xs text-velora-black/45">{r.placement}</div>
                </div>
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
          ))}
        </div>
      )}
    </div>
  );
};
