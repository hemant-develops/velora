'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdminAction } from '@/lib/audit';

export interface ComposerUser {
  id: string;
  name: string;
}

// Sends through the existing create_notification() RPC (SECURITY DEFINER,
// already granted to `authenticated` since the multi-device migration --
// see supabase_migration_multidevice.sql) rather than inserting rows
// directly, so this needs no new INSERT policy on notifications. The RPC
// takes one recipient at a time, so "All users" fans out to one call per
// user client-side; at VELORA's current scale (dozens of users, not
// thousands) that's fine -- Promise.allSettled so one bad id can't sink
// the rest.
//
// type: 'admin_broadcast' requires the widened CHECK constraint added in
// supabase/migrations/0002_admin_phase2.sql. The mobile app doesn't switch
// on notification.type to decide how to render a row (see
// NotificationsContext.tsx -- only title/message/created_at/read are
// shown), so this is safe without any mobile app change.
export const NotificationsComposer = ({ users }: { users: ComposerUser[] }) => {
  const router = useRouter();
  const [target, setTarget] = useState<'all' | string>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const send = async () => {
    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    if (!trimmedTitle || !trimmedMessage) {
      setError('Title and message are both required.');
      return;
    }

    setBusy(true);
    setError(null);
    setSentCount(null);

    const supabase = createSupabaseBrowserClient();
    const recipientIds = target === 'all' ? users.map((u) => u.id) : [target];

    const results = await Promise.allSettled(
      recipientIds.map((userId) =>
        supabase.rpc('create_notification', {
          p_id: crypto.randomUUID(),
          p_user_id: userId,
          p_type: 'admin_broadcast',
          p_title: trimmedTitle,
          p_message: trimmedMessage,
          p_target_kind: null,
          p_target_id: null,
        }),
      ),
    );

    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error),
    ).length;
    const succeeded = recipientIds.length - failures;

    await logAdminAction(supabase, {
      action: 'NOTIFICATION_BROADCAST_SENT',
      targetType: target === 'all' ? 'all_users' : 'user',
      targetId: target === 'all' ? undefined : target,
      details: `${trimmedTitle} (sent to ${succeeded}/${recipientIds.length})`,
    });

    if (failures > 0) {
      setError(
        succeeded > 0
          ? `Sent to ${succeeded} of ${recipientIds.length} — ${failures} failed. Run 0002_admin_phase2.sql if you haven't yet.`
          : `Failed to send. Run 0002_admin_phase2.sql if you haven't yet.`,
      );
    } else {
      setSentCount(succeeded);
      setTitle('');
      setMessage('');
    }

    setBusy(false);
    router.refresh();
  };

  return (
    <div className="card mb-6">
      <h2 className="mb-3 text-sm font-semibold text-velora-black">Compose</h2>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {sentCount !== null && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Sent to {sentCount} {sentCount === 1 ? 'user' : 'users'}.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-velora-black/60">Recipient</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          >
            <option value="all">All users ({users.length})</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-velora-black/60">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduled maintenance tonight"
            className="w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-velora-black/60">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="What should they know?"
          className="w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
        />
      </div>

      <button
        onClick={send}
        disabled={busy}
        className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
};
