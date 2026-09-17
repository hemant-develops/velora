import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

// An async Server Component so the Login/Account state is correct on the
// very first server-rendered response -- no client-side flash of the
// signed-out state before a session check catches up.
export const SiteHeader: React.FC = async () => {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-extrabold tracking-tight text-neutral-900"
        >
          VELORA
        </Link>

        <form
          action="/search"
          method="GET"
          className="flex min-w-0 flex-1 items-center"
        >
          <input
            type="text"
            name="q"
            placeholder="Search cars by name or brand..."
            className="h-10 w-full min-w-0 rounded-l-lg border border-r-0 border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-r-lg border border-neutral-300 bg-neutral-900 px-4 text-sm font-medium text-white"
          >
            Search
          </button>
        </form>

        <nav className="hidden shrink-0 items-center gap-5 text-sm font-medium text-neutral-600 sm:flex">
          <Link href="/search" className="hover:text-neutral-900">
            Browse Cars
          </Link>
        </nav>

        {user ? (
          <Link
            href="/account"
            className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            My Account
          </Link>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            Login / Register
          </Link>
        )}
      </div>
    </header>
  );
};
