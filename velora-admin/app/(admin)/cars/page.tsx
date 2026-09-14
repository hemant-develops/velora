import { requireAdmin } from '@/lib/admin';
import { CarsTable, type CarRow } from '@/components/CarsTable';
import { LiveBadge } from '@/components/LiveBadge';

interface RawCar {
  id: string;
  name: string;
  brand_id: string;
  owner_id: string;
  category: string;
  price_per_day: number;
  quantity: number;
  is_active: boolean;
}

export default async function CarsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: carRows, error }, { data: brandRows }, { data: ownerRows }] = await Promise.all([
    supabase
      .from('car_listings')
      .select('id, name, brand_id, owner_id, category, price_per_day, quantity, is_active')
      .order('created_at', { ascending: false }),
    supabase.from('brands').select('id, name'),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const brandNameById = new Map<string, string>();
  for (const b of (brandRows ?? []) as { id: string; name: string }[]) brandNameById.set(b.id, b.name);
  const ownerNameById = new Map<string, string>();
  for (const p of (ownerRows ?? []) as { id: string; full_name: string | null }[]) ownerNameById.set(p.id, p.full_name ?? 'Unnamed');

  const rows: CarRow[] = ((carRows ?? []) as RawCar[]).map((c) => ({
    id: c.id,
    name: c.name,
    brandName: brandNameById.get(c.brand_id) ?? c.brand_id,
    ownerName: ownerNameById.get(c.owner_id) ?? 'Unknown owner',
    category: c.category,
    pricePerDay: c.price_per_day,
    quantity: c.quantity,
    isActive: c.is_active,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Cars</h1>
        <LiveBadge tables={['car_listings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Every listing on the marketplace. Hide a listing to pull it from renters without deleting it.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load cars.
        </div>
      )}

      {!error && <CarsTable rows={rows} />}
    </div>
  );
}
