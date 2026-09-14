'use client';

import { useMemo, useState } from 'react';

export interface NotificationLogRow {
  id: string;
  recipientName: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const TYPE_LABEL: Record<string, string> = {
  booking_created: 'Booking',
  booking_status: 'Booking update',
  message: 'Chat message',
  admin_broadcast: 'Admin broadcast',
};

export const NotificationsLog = ({ rows }: { rows: NotificationLogRow[] }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.recipientName.toLowerCase().includes(q) || r.message.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-velora-black">Recent notifications</h2>
      <input
        type="text"
        placeholder="Search by recipient, title, or message..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
      />

      {filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No notifications.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Title &amp; message</th>
                <th className="px-4 py-3 font-medium">Read</th>
                <th className="px-4 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3 text-velora-black/70">{r.recipientName}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-velora-border/60 text-velora-black/60">{TYPE_LABEL[r.type] ?? r.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-velora-black">{r.title}</div>
                    <div className="max-w-md truncate text-xs text-velora-black/45">{r.message}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${r.read ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.read ? 'Read' : 'Unread'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-velora-black/45">{formatWhen(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-velora-black/40">
        {filtered.length} of {rows.length}
      </p>
    </div>
  );
};
