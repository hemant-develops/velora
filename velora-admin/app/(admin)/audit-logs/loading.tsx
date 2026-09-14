export default function AuditLogsLoading() {
  return (
    <div>
      <div className="skeleton mb-2 h-7 w-32" />
      <div className="skeleton mb-6 h-4 w-72" />
      <div className="card space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
