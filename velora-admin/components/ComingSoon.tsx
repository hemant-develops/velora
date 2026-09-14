export const ComingSoon = ({ title }: { title: string }) => (
  <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
    <span className="badge bg-velora-gold/15 text-velora-goldDark">Coming soon</span>
    <h2 className="text-lg font-semibold text-velora-black">{title}</h2>
    <p className="max-w-sm text-sm text-velora-black/50">
      This section is planned in the VELORA Admin roadmap but isn&apos;t built yet — it will land in a later phase.
    </p>
  </div>
);
