'use client';

import { useMemo, useState } from 'react';

// Only fields with a CONFIRMED backing column in `public.profiles` (see
// src/context/AuthContext.tsx's own loadUserFromSession in the main repo --
// its `.select('id, full_name, avatar_url, role')` is the only real
// select() this codebase has ever run against `profiles`). Email, phone,
// bio and location are deliberately NOT shown here: email lives on
// `auth.users` (not reachable from this anon-key client, even for admins --
// there is no service-role key in this app), and phone/bio/location have no
// confirmed database column at all (the mobile app falls back to an
// on-device-only cache for them). Showing a blank/guessed value for any of
// these would be fabricated data, which this whole codebase deliberately
// avoids (see StatCard's "Unavailable" convention).
export interface UserRow {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  extra?: { label: string; value: string };
}

export const UsersTable = ({ rows, extraColumnLabel }: { rows: UserRow[]; extraColumnLabel?: string }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.fullName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search by name or user ID..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
      />

      {filtered.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">
          {rows.length === 0 ? 'None yet.' : 'No one matches this search.'}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-velora-border bg-velora-surface text-xs uppercase tracking-wide text-velora-black/45">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                {extraColumnLabel && <th className="px-4 py-3 font-medium">{extraColumnLabel}</th>}
                <th className="px-4 py-3 font-medium">User ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-velora-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-velora-border/60">
                        {r.avatarUrl ? (
                          // A plain <img>, not next/image -- avatar URLs come from
                          // arbitrary Unsplash/Storage hosts that aren't (and
                          // don't need to be) allowlisted in next.config.js for
                          // one small 32px thumbnail.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <span className="font-medium text-velora-black">{r.fullName || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        r.role === 'owner' ? 'bg-velora-gold/15 text-velora-goldDark' : 'bg-velora-border/60 text-velora-black/60'
                      }`}
                    >
                      {r.role || 'customer'}
                    </span>
                  </td>
                  {extraColumnLabel && <td className="px-4 py-3 text-velora-black/70">{r.extra?.value ?? '—'}</td>}
                  <td className="px-4 py-3 font-mono text-xs text-velora-black/45">{r.id}</td>
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
