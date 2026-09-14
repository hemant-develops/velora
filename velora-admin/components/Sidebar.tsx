'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';

export const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-velora-border bg-white md:flex md:flex-col">
      <div className="flex items-center gap-2 border-b border-velora-border px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-velora-black text-sm font-bold text-velora-gold">
          V
        </div>
        <span className="text-sm font-semibold tracking-wide text-velora-black">VELORA Admin</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          if (!item.enabled) {
            return (
              <div
                key={item.href}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-velora-black/35"
                title="Coming in a later phase"
              >
                <span>{item.label}</span>
                <span className="badge bg-velora-border/60 text-velora-black/40">Soon</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-velora-black text-velora-gold' : 'text-velora-black/75 hover:bg-velora-surface'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
