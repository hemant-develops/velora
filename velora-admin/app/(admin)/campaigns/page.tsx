import { requireAdmin } from '@/lib/admin';
import { CampaignsManager, type CampaignRow, type PromoOption, type AdOption } from '@/components/CampaignsManager';
import { LiveBadge } from '@/components/LiveBadge';

interface RawCampaign {
  id: string;
  name: string;
  goal: string | null;
  promo_code_id: string | null;
  ad_id: string | null;
  is_active: boolean;
}

export default async function CampaignsPage() {
  const { supabase } = await requireAdmin();

  // Needs the campaigns table + admin RLS from 0004_admin_phase3.sql.
  // A campaign is an orchestration layer over Promo Codes + Ads (see
  // CampaignsManager's own comment) -- not a third system.
  const [{ data: campaignRows, error }, { data: promoRows }, { data: adRows }] = await Promise.all([
    supabase.from('campaigns').select('id, name, goal, promo_code_id, ad_id, is_active').order('created_at', { ascending: false }),
    supabase.from('promo_codes').select('id, code'),
    supabase.from('ads').select('id, title'),
  ]);

  const promoLabelById = new Map<string, string>();
  const promoOptions: PromoOption[] = ((promoRows ?? []) as { id: string; code: string }[]).map((p) => {
    promoLabelById.set(p.id, p.code);
    return { id: p.id, label: p.code };
  });

  const adLabelById = new Map<string, string>();
  const adOptions: AdOption[] = ((adRows ?? []) as { id: string; title: string }[]).map((a) => {
    adLabelById.set(a.id, a.title);
    return { id: a.id, label: a.title };
  });

  const rows: CampaignRow[] = ((campaignRows ?? []) as RawCampaign[]).map((c) => ({
    id: c.id,
    name: c.name,
    goal: c.goal,
    promoCodeLabel: c.promo_code_id ? promoLabelById.get(c.promo_code_id) ?? null : null,
    adLabel: c.ad_id ? adLabelById.get(c.ad_id) ?? null : null,
    isActive: c.is_active,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Campaigns</h1>
        <LiveBadge tables={['campaigns']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Named pushes that group a promo code and/or an ad with a goal.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load campaigns. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <CampaignsManager rows={rows} promoOptions={promoOptions} adOptions={adOptions} />}
    </div>
  );
}
