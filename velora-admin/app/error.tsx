'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('VELORA_ADMIN_UNCAUGHT_ERROR:', error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-velora-black">Something went wrong</h1>
      <p className="max-w-sm text-sm text-velora-black/50">
        An unexpected error occurred loading this page. You can try again, or sign in again if the problem continues.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg bg-velora-black px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
