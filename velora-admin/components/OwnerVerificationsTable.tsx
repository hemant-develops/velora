'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface OwnerVerificationRow {
  userId: string;
  userName: string;
  status: string;
  fullName: string;
  phone: string;
  idType: string;
  idDocumentPath: string | null;
  submittedAt: string;
  rejectionReason: string | null;
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// Admin review UI for the real owner-verification backend
// (0020_owner_verifications.sql) -- replaces the old "instant approve,
// nothing to review" flow. Approve/Reject call review_owner_verification
// (SECURITY DEFINER, admin-only via public.is_admin()). The ID document
// lives in a PRIVATE storage bucket, so viewing it fetches a short-lived
// signed URL on demand rather than ever exposing a public link.
export const OwnerVerificationsTable = ({ rows }: { rows: OwnerVerificationRow[] }) => {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (row: OwnerVerificationRow, approve: boolean) => {
    if (!approve) {
      const reason = window.prompt('Reason for rejecting this verification (shown to the owner):');
      if (reason === null) return; // cancelled
      await submitReview(row.userId, false, reason);
      return;
    }
    await submitReview(row.userId, true, null);
  };

  const submitReview = async (userId: string, approve: boolean, reason: string | null) => {
    setBusyId(userId);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase.rpc('review_owner_verification', {
      p_user_id: userId,
      p_approve: approve,
      p_rejection_reason: reason,
    });
    if (err) setError(err.message);
    else if (!data?.success) setError(data?.error ?? 'Review failed.');
    setBusyId(null);
    router.refresh();
  };

  const viewDocument = async (path: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase.storage.from('owner-id-documents').createSignedUrl(path, 300);
    if (err || !data?.signedUrl) {
      setError(err?.message ?? "Couldn't load the document.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (rows.length === 0) {
    return <div className="card py-16 text-center text-sm text-velora-black/40">No pending verifications.</div>;
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.userId} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-velora-border/60 text-velora-black/60">{r.idType}</span>
                  <span
                    className={`badge ${
                      r.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : r.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-2 font-medium text-velora-black">{r.fullName}</p>
                <p className="mt-1 text-sm text-velora-black/70">
                  Account: {r.userName} · Phone: {r.phone}
                </p>
                {r.rejectionReason && <p className="mt-1 text-sm text-red-600">Previously rejected: {r.rejectionReason}</p>}
                <p className="mt-2 text-xs text-velora-black/40">Submitted {formatWhen(r.submittedAt)}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {r.idDocumentPath && (
                  <button
                    onClick={() => viewDocument(r.idDocumentPath as string)}
                    className="rounded-lg border border-velora-border px-3 py-1.5 text-xs font-medium text-velora-black/75 transition hover:bg-velora-surface"
                  >
                    View ID document
                  </button>
                )}
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => review(r, true)}
                      disabled={busyId === r.userId}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => review(r, false)}
                      disabled={busyId === r.userId}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
