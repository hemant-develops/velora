import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-neutral-900">Page not found</h1>
      <p className="mt-2 text-sm text-neutral-500">This car listing may have been removed or is no longer available.</p>
      <Link href="/search" className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
        Browse Cars
      </Link>
    </div>
  );
}
