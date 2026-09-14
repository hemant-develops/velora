import { requireAdmin } from '@/lib/admin';
import { BrandsModelsManager, type BrandRow, type ModelRow } from '@/components/BrandsModelsManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawBrand {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  display_order: number;
}

interface RawModel {
  id: string;
  brand_id: string;
  name: string;
  body_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  seats: number | null;
  is_active: boolean;
  is_custom: boolean;
}

export default async function BrandsModelsPage() {
  const { supabase } = await requireAdmin();

  // Both queries need the NEW admin policies added in
  // supabase/migrations/0002_admin_phase2.sql (brands_admin_write already
  // let admins see every brand incl. inactive ones since Phase A; car_models
  // needed a new car_models_select_admin policy, since the mobile app's own
  // car_models_select policy only shows an admin the models THEY personally
  // submitted, not every owner's pending ones).
  const [{ data: brandRows, error: brandsError }, { data: modelRows, error: modelsError }] = await Promise.all([
    supabase.from('brands').select('id, name, logo_url, is_active, display_order').order('display_order'),
    supabase.from('car_models').select('id, brand_id, name, body_type, fuel_type, transmission, seats, is_active, is_custom').order('display_order'),
  ]);

  const brands: BrandRow[] = ((brandRows ?? []) as RawBrand[]).map((b) => ({
    id: b.id,
    name: b.name,
    logoUrl: b.logo_url,
    isActive: b.is_active,
    displayOrder: b.display_order,
  }));

  const models: ModelRow[] = ((modelRows ?? []) as RawModel[]).map((m) => ({
    id: m.id,
    brandId: m.brand_id,
    name: m.name,
    bodyType: m.body_type,
    fuelType: m.fuel_type,
    transmission: m.transmission,
    seats: m.seats,
    isActive: m.is_active,
    isCustom: m.is_custom,
  }));

  const error = brandsError || modelsError;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Brands &amp; Models</h1>
        <LiveBadge tables={['brands', 'car_models']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">
        Manage the catalog owners pick from when listing a car, and review models owners submitted manually.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load the catalog. Run <code className="rounded bg-amber-100 px-1 py-0.5">0002_admin_phase2.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <BrandsModelsManager brands={brands} models={models} />}
    </div>
  );
}
