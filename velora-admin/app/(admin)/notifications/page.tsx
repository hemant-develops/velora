import { requireAdmin } from '@/lib/admin';
import { NotificationsComposer, type ComposerUser } from '@/components/NotificationsComposer';
import { NotificationsLog, type NotificationLogRow } from '@/components/NotificationsLog';
import { LiveBadge } from '@/components/LiveBadge';

interface RawNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default async function NotificationsPage() {
  const { supabase } = await requireAdmin();

  // notifications needs the new notifications_select_admin policy
  // (0002_admin_phase2.sql) -- the existing notifications_select policy only
  // shows a user their own rows. profiles is already admin-readable.
  const [{ data: notificationRows, error }, { data: profileRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, user_id, type, title, message, read, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const nameById = new Map<string, string>();
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
    nameById.set(p.id, p.full_name ?? 'Unnamed');
  }

  const users: ComposerUser[] = ((profileRows ?? []) as { id: string; full_name: string | null }[])
    .map((p) => ({ id: p.id, name: p.full_name ?? 'Unnamed' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const logRows: NotificationLogRow[] = ((notificationRows ?? []) as RawNotification[]).map((n) => ({
    id: n.id,
    recipientName: nameById.get(n.user_id) ?? 'Unknown',
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAt: n.created_at,
  }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-velora-black">Notifications</h1>
        <LiveBadge tables={['notifications']} />
      </div>
      <p className="mb-6 text-sm text-velora-black/50">Send an announcement to everyone or one person, and see what's already gone out.</p>

      <NotificationsComposer users={users} />

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t load the notification log. Run <code className="rounded bg-amber-100 px-1 py-0.5">0002_admin_phase2.sql</code> if you haven&apos;t yet.
        </div>
      )}

      {!error && <NotificationsLog rows={logRows} />}
    </div>
  );
}
