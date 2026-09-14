'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface SettingRow {
  key: string;
  value: string;
  description: string | null;
}

// Plain key/value business configuration (e.g. platform_commission_percent,
// min_booking_hours, support_email). This is the STORE only -- nothing in
// the mobile app or the rest of this admin site reads these values yet
// (Owner Payouts/Revenue below do read platform_commission_percent, since
// they're built in the same pass -- see their own comments). Wiring any
// other key into actual app behavior is a separate follow-up per key.
export const SettingsManager = ({ settings }: { settings: SettingRow[] }) => {
  const router = useRouter();
  const [rows, setRows] = useState(settings);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusyKey(key);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    setBusyKey(null);
    router.refresh();
  };

  const addSetting = () => {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) {
      setError('Key and value are both required.');
      return;
    }
    run(key, async () => {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase
        .from('app_settings')
        .insert({ key, value, description: newDescription.trim() || null });
      if (!result.error) {
        setNewKey('');
        setNewValue('');
        setNewDescription('');
      }
      return result;
    });
  };

  const updateValue = (key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  };

  const saveRow = (row: SettingRow) => {
    run(row.key, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('app_settings').update({ value: row.value, updated_at: new Date().toISOString() }).eq('key', row.key);
    });
  };

  const deleteRow = (key: string) => {
    run(key, async () => {
      const supabase = createSupabaseBrowserClient();
      return supabase.from('app_settings').delete().eq('key', key);
    });
  };

  return (
    <div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-velora-black">Add a setting</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="key (e.g. platform_commission_percent)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="text"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
          <input
            type="text"
            placeholder="description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>
        <button
          onClick={addSetting}
          disabled={busyKey !== null}
          className="mt-3 rounded-lg bg-velora-gold px-4 py-2 text-sm font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
        >
          Add setting
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card py-16 text-center text-sm text-velora-black/40">No settings yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="card">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="font-mono text-xs text-velora-black/45">{row.key}</div>
                  {row.description && <p className="mt-0.5 text-xs text-velora-black/40">{row.description}</p>}
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateValue(row.key, e.target.value)}
                    className="mt-2 w-full max-w-xs rounded-lg border border-velora-border px-3 py-1.5 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => saveRow(row)}
                    disabled={busyKey === row.key}
                    className="rounded-lg bg-velora-gold px-3 py-1.5 text-xs font-medium text-velora-black transition hover:bg-velora-goldDark disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => deleteRow(row.key)}
                    disabled={busyKey === row.key}
                    className="rounded-lg border border-velora-border px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
