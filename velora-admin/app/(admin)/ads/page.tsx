import { requireAdmin } from '@/lib/admin';
import { AdsManager, type AdRow } from '@/components/AdsManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawAd {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  is_active: boolean;
}

export default async function AdsPage() {
  const { supabase } = await requireAdmin();

  // Needs the ads table + admin RLS from 0004_admin_phase3.sql.
  const { data, error } = await supabase
    .from('ads')
    .select('id, title, image_url, link_url, placement, is_active')
    .order('display_order', { ascending: true });

  const rows: AdRow[] = ((data ?? []) as RawAd[]).map((a) => ({
    id: a.id,
    title: a.title,
    imageUrl: a.image_url,
    linkUrl: a.link_url,
    placement: a.placement,
    isActive: a.is_active,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Ads</h1>
        <LiveBadge tables={['ads']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">In-app promotional creatives, by placement.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load ads. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <AdsManager rows={rows} />}
    </div>
  );
}
