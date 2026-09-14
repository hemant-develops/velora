'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting';

// Live-updates the admin panel: subscribes to Postgres change events
// (insert/update/delete) on the given tables and calls router.refresh()
// when one fires, so the Server Component page re-fetches straight from
// Supabase. Deliberately does NOT keep its own copy of the data client-side
// -- Supabase stays the single source of truth, same as every other admin
// mutation in this app (no fabricated/duplicated state).
//
// Needs two things server-side, both in supabase/migrations/0003_enable_realtime.sql:
//   1. Each watched table added to the `supabase_realtime` publication.
//   2. Existing RLS SELECT policies -- Realtime only delivers events for
//      rows the subscriber could already read, so an admin only gets
//      events once the matching *_select_admin policy exists (0002).
// Until that migration has run, this hook just sits in "connecting" --
// it never breaks the page, the page just doesn't live-update yet.
//
// Debounced (400ms) so a burst of changes -- e.g. an admin broadcast
// notification fanning out to every user -- triggers one refresh, not N.
export const useRealtimeRefresh = (tables: string[]): RealtimeStatus => {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(',');

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`admin-realtime-${key}`);

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => router.refresh(), 400);
    };

    for (const table of key.split(',')) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table } as never, scheduleRefresh);
    }

    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') setStatus('live');
      else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') setStatus('reconnecting');
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return status;
};
