import type { SupabaseClient } from '@supabase/supabase-js';

// Safe, minimal action vocabulary for Phase 1. Later phases add their own
// (CAR_APPROVED, PROMO_CREATED, ...) as those features are actually built —
// not pre-declared here speculatively.
export type AdminAuditAction =
  | 'ADMIN_LOGIN'
  | 'ADMIN_LOGOUT'
  | 'ADMIN_LOGIN_FAILED'
  | 'NOTIFICATION_BROADCAST_SENT';

interface LogAdminActionParams {
  action: AdminAuditAction;
  targetType?: string;
  targetId?: string;
  details?: string;
}

// Writes one row to admin_audit_log. Works from either the browser client
// (login/logout happen client-side) or the server client, since both are
// still just the signed-in user's own authenticated Supabase client — the
// insert is only ever accepted by RLS when admin_id = auth.uid() AND
// is_admin() (see the migration), so this can never be used to forge an
// entry for someone else or as a non-admin.
//
// Deliberately fire-and-forget from the caller's perspective (returns a
// boolean rather than throwing) — an audit-log write failing must never
// block or fail the actual login/logout it's describing.
export const logAdminAction = async (
  supabase: SupabaseClient,
  params: LogAdminActionParams,
): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: user.id,
    admin_email: user.email ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    details: params.details ?? null,
  });

  if (error) {
    console.error(`VELORA_ADMIN_AUDIT_LOG_ERROR action=${params.action}:`, error.message);
    return false;
  }
  return true;
};
