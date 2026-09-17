import { requireAdmin } from '@/lib/admin';
import { OwnerVerificationsTable, type OwnerVerificationRow } from '@/components/OwnerVerificationsTable';
import { LiveBadge } from '@/components/LiveBadge';

interface RawVerification {
  user_id: string;
  status: string;
  full_name: string;
  phone: string;
  id_type: string;
  id_document_path: string | null;
  submitted_at: string;
  rejection_reason: string | null;
}

// Admin review page for the real owner-verification backend (see
// 0020_owner_verifications.sql) -- the admin-only SELECT already granted
// by owner_verifications_select_own's `or public.is_admin()` clause is
// what makes this readable here with no further migration.
export default async function OwnerVerificationsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: verificationRows, error }, { data: profileRows }] = await Promise.all([
    supabase
      .from('owner_verifications')
      .select('user_id, status, full_name, phone, id_type, id_document_path, submitted_at, rejection_reason')
      .order('status', { ascending: true }) // 'pending' sorts before 'rejected'/'verified'
      .order('submitted_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const nameById = new Map<string, string>();
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
    nameById.set(p.id, p.full_name ?? 'Unnamed');
  }

  const rows: OwnerVerificationRow[] = ((verificationRows ?? []) as RawVerification[]).map((v) => ({
    userId: v.user_id,
    userName: nameById.get(v.user_id) ?? 'Unknown account',
    status: v.status,
    fullName: v.full_name,
    phone: v.phone,
    idType: v.id_type,
    idDocumentPath: v.id_document_path,
    submittedAt: v.submitted_at,
    rejectionReason: v.rejection_reason,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Owner Verifications</h1>
        <LiveBadge tables={['owner_verifications']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">
        Review government-ID submissions before an account can list cars. Approve/Reject calls the
        review_owner_verification RPC — nothing here writes to this table directly.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load verifications. Run <code className="rounded bg-amber-100 px-1 py-0.5">0020_owner_verifications.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <OwnerVerificationsTable rows={rows} />}
    </div>
  );
}
