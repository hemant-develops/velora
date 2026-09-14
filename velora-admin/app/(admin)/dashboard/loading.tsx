import { StatCardSkeleton } from '@/components/StatCard';

export default function DashboardLoading() {
  return (
    <div>
      <div className="skeleton mb-2 h-7 w-40" />
      <div className="skeleton mb-6 h-4 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
