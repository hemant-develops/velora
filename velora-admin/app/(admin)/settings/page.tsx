import { requireAdmin } from '@/lib/admin';
import { SettingsManager, type SettingRow } from '@/components/SettingsManager';
import { LiveBadge } from '@/components/LiveBadge';

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();

  // Needs the app_settings table + admin RLS from 0004_admin_phase3.sql.
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, description')
    .order('key', { ascending: true });

  const rows: SettingRow[] = ((data ?? []) as SettingRow[]) ?? [];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Settings</h1>
        <LiveBadge tables={['app_settings']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">
        Business configuration. Add <code className="rounded bg-velora-surface px-1 py-0.5">platform_commission_percent</code> here to drive Owner Payouts and Revenue.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load settings. Run <code className="rounded bg-amber-100 px-1 py-0.5">0004_admin_phase3.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <SettingsManager settings={rows} />}
    </div>
  );
}
