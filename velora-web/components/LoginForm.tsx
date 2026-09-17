'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import { isValidOtp, toE164IndianPhone } from '@/lib/phone';

const RESEND_COOLDOWN_SECONDS = 30;

// Same Supabase Auth phone-OTP flow the mobile app's AuthContext.sendPhoneOtp/
// verifyPhoneOtp already use (signInWithOtp({phone}) + verifyOtp({type:'sms'}))
// -- an account created here IS the same account usable in the app, since
// both point at the same Supabase Auth project. Google sign-in uses the
// standard OAuth redirect flow, completed by app/auth/callback/route.ts.
//
// A plain child of app/login/page.tsx (which wraps it in <Suspense>) --
// useSearchParams() in a Client Component requires that boundary, or the
// production build fails.
export const LoginForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onGoogleLogin = async () => {
    setError(undefined);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Login is temporarily unavailable. Please try again shortly.');
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}` },
    });
    if (oauthError) setError(oauthError.message);
  };

  const onSendOtp = async () => {
    const e164 = toE164IndianPhone(phone);
    if (!e164) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setError(undefined);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Login is temporarily unavailable. Please try again shortly.');
      setLoading(false);
      return;
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setOtpSent(true);
    startCooldown();
  };

  const onVerifyOtp = async () => {
    if (!isValidOtp(otp)) {
      setError('Enter the 6-digit code sent to your phone.');
      return;
    }
    const e164 = toE164IndianPhone(phone);
    if (!e164) return;
    setError(undefined);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Login is temporarily unavailable. Please try again shortly.');
      setLoading(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: e164, token: otp.trim(), type: 'sms' });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">Login or Register</h1>
      <p className="mt-1 text-sm text-neutral-500">Car owners: manage your subscription and store. Customers: save favorites and get updates.</p>

      <button
        type="button"
        onClick={onGoogleLogin}
        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
      >
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        or with phone
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {!otpSent ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">Mobile number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              className="h-11 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
            />
          </label>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={onSendOtp}
            disabled={loading}
            className="mt-4 h-11 rounded-lg bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Code sent to +91 {phone.trim()}.</p>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="h-11 rounded-lg border border-neutral-300 px-3 text-sm tracking-widest text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
            />
          </label>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={onSendOtp}
            disabled={resendCooldown > 0 || loading}
            className="mt-3 h-10 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
          </button>
          <button
            type="button"
            onClick={onVerifyOtp}
            disabled={loading}
            className="mt-3 h-11 rounded-lg bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </>
      )}
    </div>
  );
};
