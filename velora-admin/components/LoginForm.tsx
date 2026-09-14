'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdminAction } from '@/lib/audit';

// Generic, non-specific message deliberately used for every failure case
// below (wrong password, unknown email, valid account but not an admin).
// Distinguishing "wrong password" from "not an admin" in the UI would leak
// which emails have real VELORA accounts and which of those are admins —
// neither is something an anonymous visitor to this login page should be
// able to learn.
const GENERIC_ERROR = "Couldn't sign in. Check your email and password and try again.";

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configError = searchParams.get('error') === 'config';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.session) {
      setError(GENERIC_ERROR);
      setSubmitting(false);
      return;
    }

    const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_admin');

    if (adminCheckError || !isAdmin) {
      // Valid VELORA account, but not an admin (or the check itself
      // failed) -- sign back out immediately rather than leaving a
      // non-admin session sitting in this app's cookies.
      await logAdminAction(supabase, {
        action: 'ADMIN_LOGIN_FAILED',
        details: adminCheckError ? 'admin_check_error' : 'not_admin',
      }).catch(() => undefined);
      await supabase.auth.signOut();
      setError(GENERIC_ERROR);
      setSubmitting(false);
      return;
    }

    await logAdminAction(supabase, { action: 'ADMIN_LOGIN' });

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-velora-black text-lg font-bold text-velora-gold">
          V
        </div>
        <h1 className="text-xl font-semibold text-velora-black">VELORA Admin</h1>
        <p className="mt-1 text-sm text-velora-black/60">Sign in with your admin account.</p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4">
        {configError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            This deployment is missing its Supabase environment variables.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-velora-black/80">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-velora-black/80">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-velora-border px-3 py-2 text-sm outline-none focus:border-velora-gold focus:ring-1 focus:ring-velora-gold"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-velora-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-velora-charcoal disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-velora-black/40">
        Admin access is granted from the Supabase dashboard only — there is no self-service sign-up here.
      </p>
    </div>
  );
};
