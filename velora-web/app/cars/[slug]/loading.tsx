export default function CarLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-8 sm:px-6" aria-label="Loading car">
      <div className="aspect-[16/9] rounded-2xl bg-neutral-200" />
      <div className="mt-6 h-8 w-2/3 rounded bg-neutral-200" />
      <div className="mt-3 h-4 w-1/3 rounded bg-neutral-200" />
    </div>
  );
}