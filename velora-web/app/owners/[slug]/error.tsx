'use client';

export default function OwnerStoreError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-neutral-900">This store could not be loaded</h1>
      <p className="mt-2 text-sm text-neutral-500">The store may be temporarily unavailable. Please try again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-neutral-900 px-5 py-3 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}