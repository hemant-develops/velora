// Single source of truth for the sidebar. Every section below now has a
// real app/(admin)/*/page.tsx (Phase 2 + Phase 3 complete) -- "enabled"
// here just means the code exists, not that its migration has been run.
// A handful of these sections error gracefully with an amber banner
// ("run 0002/0003/0004_*.sql") until their migration is applied -- see
// each page's own comments for which one it needs.
export interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', enabled: true },
  { label: 'Users', href: '/users', enabled: true },
  { label: 'Owners', href: '/owners', enabled: true },
  { label: 'Owner Verifications', href: '/owner-verifications', enabled: true },
  { label: 'Cars', href: '/cars', enabled: true },
  { label: 'Bookings', href: '/bookings', enabled: true },
  { label: 'Promo Codes', href: '/promo-codes', enabled: true },
  { label: 'Campaigns', href: '/campaigns', enabled: true },
  { label: 'Reports', href: '/reports', enabled: true },
  { label: 'Payments', href: '/payments', enabled: true },
  { label: 'Owner Payouts', href: '/owner-payouts', enabled: true },
  { label: 'Revenue', href: '/revenue', enabled: true },
  { label: 'Brands & Models', href: '/brands-models', enabled: true },
  { label: 'Featured Listings', href: '/featured-listings', enabled: true },
  { label: 'Ads', href: '/ads', enabled: true },
  { label: 'Notifications', href: '/notifications', enabled: true },
  { label: 'Settings', href: '/settings', enabled: true },
  { label: 'Audit Logs', href: '/audit-logs', enabled: true },
];
