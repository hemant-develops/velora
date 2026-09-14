interface StatCardProps {
  label: string;
  value: number | string | null;
  hint?: string;
}

// `value: null` renders "Unavailable" instead of a fake/placeholder number
// — used when a count genuinely couldn't be computed (a query error), never
// as a stand-in for "haven't built this yet." See app/(admin)/dashboard/page.tsx.
// `value` as a string is for pre-formatted figures (e.g. "₹1,25,000" for a
// currency stat, see app/(admin)/revenue/page.tsx) -- shown as-is, a number
// still goes through toLocaleString for the usual plain-count cards.
export const StatCard = ({ label, value, hint }: StatCardProps) => (
  <div className="card">
    <p className="text-sm font-medium text-velora-black/55">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-velora-black">
      {value === null ? (
        <span className="text-base font-medium text-velora-black/35">Unavailable</span>
      ) : typeof value === 'string' ? (
        value
      ) : (
        value.toLocaleString('en-IN')
      )}
    </p>
    {hint && <p className="mt-1 text-xs text-velora-black/40">{hint}</p>}
  </div>
);

export const StatCardSkeleton = () => (
  <div className="card">
    <div className="skeleton h-4 w-24" />
    <div className="skeleton mt-3 h-8 w-16" />
  </div>
);
