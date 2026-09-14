import { requireAdmin } from '@/lib/admin';
import { FeaturedListingsManager, type FeaturedRow, type CarOption } from '@/components/FeaturedListingsManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawFeatured {
  id: string;
  car_id: string;
  display_order: number;
  is_active: boolean;
}

export default async function FeaturedListingsPage() {
  const { supabase } = await requireAdmin();

  // Needs the featured_listings table + admin RLS from 0004_admin_phase3.sql.
  const [{ data: featuredRows, error }, { data: carRows }] = await Promise.all([
    supabase.from('featured_listings').select('id, car_id, display_order, is_active'),
    supabase.from('car_listings').select('id, name').eq('is_active', true).order('name'),
  ]);

  const carNameById = new Map<string, string>();
  const carOptions: CarOption[] = ((carRows ?? []) as { id: string; name: string }[]).map((c) => {
    carNameById.set(c.id, c.name);
    return { id: c.id, name: c.name };
  });

  const rows: FeaturedRow[] = ((featuredRows ?? []) as RawFeatured[]).map((f) => ({
    id: f.id,
    carId: f.car_id,
    carName: carNameById.get(f.car_id) ?? 'Deleted listing',
    displayOrder: f.display_order,
    isActive: f.is_active,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Featured Listings</h1>
        <LiveBadge tables={['featured_listings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Cars to spotlight, once a featured rail exists on the home screen.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load featured listings. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <FeaturedListingsManager rows={rows} carOptions={carOptions} />}
    </div>
  );
}
