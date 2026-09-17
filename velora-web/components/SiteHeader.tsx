import Link from 'next/link';

// A plain native GET form (no client JS needed) -- submitting it navigates
// the browser straight to /search?q=..., which is the exact same page and
// URL-encoded criteria shape the homepage's full SearchForm produces. This
// is what makes "arrived via the header search" and "arrived via the
// homepage search" always land on the identical Search Results page the
// product spec asks for, with zero duplicated logic between the two entry
// points.
export const SiteHeader: React.FC = () => (
  <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
      <Link href="/" className="shrink-0 text-lg font-extrabold tracking-tight text-neutral-900">
        VELORA
      </Link>

      <form action="/search" method="GET" className="flex min-w-0 flex-1 items-center">
        <input
          type="text"
          name="q"
          placeholder="Search cars by name or brand..."
          className="h-10 w-full min-w-0 rounded-l-lg border border-r-0 border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500"
        />
        <button type="submit" className="h-10 shrink-0 rounded-r-lg border border-neutral-300 bg-neutral-900 px-4 text-sm font-medium text-white">
          Search
        </button>
      </form>

      <nav className="hidden shrink-0 items-center gap-5 text-sm font-medium text-neutral-600 sm:flex">
        <Link href="/search" className="hover:text-neutral-900">
          Browse Cars
        </Link>
      </nav>
    </div>
  </header>
);
