import { requireAdmin } from '@/lib/admin';
import { ReportsTable, type ReportRow } from '@/components/ReportsTable';
import { LiveBadge } from '@/components/LiveBadge';

interface RawReport {
  id: string;
  reporter_id: string;
  target_kind: string;
  target_label: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
}

export default async function ReportsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: reportRows, error }, { data: profileRows }] = await Promise.all([
    supabase
      .from('reports')
      .select('id, reporter_id, target_kind, target_label, reason, details, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const nameById = new Map<string, string>();
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) nameById.set(p.id, p.full_name ?? 'Unnamed');

  const rows: ReportRow[] = ((reportRows ?? []) as RawReport[]).map((r) => ({
    id: r.id,
    reporterName: nameById.get(r.reporter_id) ?? 'Unknown',
    targetKind: r.target_kind,
    targetLabel: r.target_label,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.created_at,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Reports</h1>
        <LiveBadge tables={['reports']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Listings, users, and conversations flagged by the community.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load reports. Run <code className="rounded bg-amber-100 px-1 py-0.5">0002_admin_phase2.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <ReportsTable rows={rows} />}
    </div>
  );
}
