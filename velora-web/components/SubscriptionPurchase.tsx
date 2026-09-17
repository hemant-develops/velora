'use client';

import Script from 'next/script';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseBrowserClient';
import { formatCurrency } from '@/lib/format';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface Props {
  userEmail: string;
  userName: string;
  isActive: boolean;
  expiresAt: string | null;
}

// Web counterpart of the mobile app's SubscriptionScreen.tsx -- same two
// Edge Functions (create-subscription-order / verify-subscription-payment),
// same real, server-verified Razorpay payment, just using Razorpay's
// Checkout.js (web) instead of react-native-razorpay. Neither this
// component nor any other browser code ever sees a Razorpay secret --
// both Edge Functions hold that, exactly like send-push holds the
// service-role key.
export const SubscriptionPurchase: React.FC<Props> = ({ userEmail, userName, isActive, expiresAt }) => {
  const router = useRouter();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [scriptReady, setScriptReady] = useState(false);

  const onSubscribe = async () => {
    if (purchasing || !scriptReady) return;
    setError(undefined);
    setPurchasing(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setError('Subscriptions are temporarily unavailable. Please try again shortly.');
        setPurchasing(false);
        return;
      }
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-subscription-order');
      if (orderError || orderData?.error) {
        setError(orderData?.error ?? "Couldn't start the payment. Please try again.");
        setPurchasing(false);
        return;
      }

      const razorpay = new window.Razorpay({
        key: orderData.keyId,
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'VELORA',
        description: 'Owner Subscription — 3 months',
        prefill: { email: userEmail, name: userName },
        theme: { color: '#F4C728' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-subscription-payment', {
            body: {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          });
          if (verifyError || verifyData?.error) {
            setError(verifyData?.error ?? 'Payment could not be verified. Please contact support if you were charged.');
            setPurchasing(false);
            return;
          }
          router.refresh();
          setPurchasing(false);
        },
        modal: {
          // The person simply closing the Checkout modal without paying --
          // not a failure, just stop showing "purchasing…".
          ondismiss: () => setPurchasing(false),
        },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the payment. Please try again.");
      setPurchasing(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setScriptReady(true)} />

      {isActive ? (
        <>
          <p className="text-sm font-semibold text-emerald-700">Subscription active</p>
          {expiresAt ? <p className="mt-1 text-sm text-neutral-500">Valid until {new Date(expiresAt).toLocaleDateString('en-IN')}.</p> : null}
        </>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">VELORA Owner Plan</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {formatCurrency(1)}
            <span className="text-sm font-normal text-neutral-500"> / 3 months</span>
          </p>
          <p className="mt-1 text-xs text-neutral-400">Introductory pricing — subject to change on renewal.</p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={onSubscribe}
            disabled={purchasing || !scriptReady}
            className="mt-4 h-11 w-full rounded-lg bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {purchasing ? 'Opening payment…' : `Subscribe for ${formatCurrency(1)}`}
          </button>
        </>
      )}
    </div>
  );
};
