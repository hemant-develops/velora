'use client';

import { useRealtimeRefresh, type RealtimeStatus } from '@/hooks/useRealtimeRefresh';

const LABEL: Record<RealtimeStatus, { text: string; badge: string; dot: string }> = {
  connecting: { text: 'Connecting…', badge: 'bg-velora-border/60 text-velora-black/50', dot: 'bg-velora-black/30' },
  live: { text: 'Live', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  reconnecting: { text: 'Reconnecting…', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
};

// Drop this next to any page's <h1> to auto-refresh that page whenever the
// listed tables change in Supabase, and to show the connection state. See
// hooks/useRealtimeRefresh.ts for what "live" depends on.
export const LiveBadge = ({ tables }: { tables: string[] }) => {
  const status = useRealtimeRefresh(tables);
  const { text, badge, dot } = LABEL[status];
  return (
    <span className={`badge inline-flex items-center gap-1.5 ${badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === 'live' ? 'animate-pulse' : ''}`} />
      {text}
    </span>
  );
};
