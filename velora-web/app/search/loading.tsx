export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6" aria-label="Loading search results">
      <div className="h-40 rounded-2xl bg-neutral-200" />
      <div className="mt-8 h-7 w-56 rounded bg-neutral-200" />
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="aspect-[4/3] rounded-2xl bg-neutral-200" />)}
      </div>
    </div>
  );
}