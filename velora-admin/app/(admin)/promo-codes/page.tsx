import { requireAdmin } from '@/lib/admin';
import { PromoCodesManager, type PromoCodeRow } from '@/components/PromoCodesManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawPromoCode {
  id: string;
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
}

export default async function PromoCodesPage() {
  const { supabase } = await requireAdmin();

  // Needs the promo_codes table + admin RLS from 0004_admin_phase3.sql.
  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, discount_type, discount_value, max_uses, used_count, expires_at, is_active')
    .order('created_at', { ascending: false });

  const rows: PromoCodeRow[] = ((data ?? []) as RawPromoCode[]).map((p) => ({
    id: p.id,
    code: p.code,
    discountType: p.discount_type,
    discountValue: p.discount_value,
    maxUses: p.max_uses,
    usedCount: p.used_count,
    expiresAt: p.expires_at,
    isActive: p.is_active,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Promo Codes</h1>
        <LiveBadge tables={['promo_codes']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Create and manage discount codes.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load promo codes. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <PromoCodesManager rows={rows} />}
    </div>
  );
}
