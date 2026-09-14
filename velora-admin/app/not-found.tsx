import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-velora-black">Page not found</h1>
      <p className="text-sm text-velora-black/50">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/dashboard" className="mt-2 rounded-lg bg-velora-black px-4 py-2 text-sm font-medium text-white">
        Back to Dashboard
      </Link>
    </div>
  );
}
