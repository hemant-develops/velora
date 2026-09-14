'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface ReportRow {
  id: string;
  reporterName: string;
  targetKind: string;
  targetLabel: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export const ReportsTable = ({ rows }: { rows: ReportRow[] }) => {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleStatus = async (row: ReportRow) => {
    setBusyId(row.id);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    // Needs reports_select_admin + reports_update_admin (0002_admin_phase2.sql).
    const { error: err } = await supabase
      .from('reports')
      .update({ status: row.status === 'open' ? 'reviewed' : 'open' })
      .eq('id', row.id);
    if (err) setError(err.message);
    setBusyId(null);
    router.refresh();
  };

  if (rows.length === 0) {
    return <div className="card py-16 text-center text-sm text-velora-black/40">No reports.</div>;
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-velora-border/60 text-velora-black/60">{r.targetKind}</span>
                  <span className={`badge ${r.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {r.status === 'open' ? 'Open' : 'Reviewed'}
                  </span>
                </div>
                <p className="mt-2 font-medium text-velora-black">{r.targetLabel}</p>
                <p className="mt-1 text-sm text-velora-black/70">Reason: {r.reason}</p>
                {r.details && <p className="mt-1 text-sm text-velora-black/50">{r.details}</p>}
                <p className="mt-2 text-xs text-velora-black/40">
                  Reported by {r.reporterName} · {formatWhen(r.createdAt)}
                </p>
              </div>
              <button
                onClick={() => toggleStatus(r)}
                disabled={busyId === r.id}
                className="shrink-0 rounded-lg border border-velora-border px-3 py-1.5 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface disabled:opacity-60"
              >
                {r.status === 'open' ? 'Mark reviewed' : 'Reopen'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
