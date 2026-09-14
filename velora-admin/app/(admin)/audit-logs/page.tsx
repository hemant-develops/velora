import { requireAdmin } from '@/lib/admin';
import type { AdminAuditLogRow } from '@/types/database';

const ACTION_BADGE: Record<string, string> = {
  ADMIN_LOGIN: 'bg-emerald-100 text-emerald-700',
  ADMIN_LOGOUT: 'bg-velora-border text-velora-black/60',
  ADMIN_LOGIN_FAILED: 'bg-red-100 text-red-700',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default async function AuditLogsPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, admin_id, admin_email, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as AdminAuditLogRow[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-velora-black">Audit Logs</h1>
      <p className="mb-6 text-sm text-velora-black/50">Most recent 100 admin actions, newest first.</p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load audit logs. Run the Phase 1 migration if you haven&apos;t yet.
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="card py-16 text-center text-sm text-velora-black/40">No audit log entries yet.</div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-velora-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-velora-black/70">{formatWhen(row.created_at)}</td>
                  <td className="px-4 py-3 text-velora-black/70">{row.admin_email ?? row.admin_id}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ACTION_BADGE[row.action] ?? 'bg-velora-border text-velora-black/60'}`}>
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-velora-black/70">
                    {row.target_type ? `${row.target_type}${row.target_id ? ` · ${row.target_id}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-velora-black/50">{row.details ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
