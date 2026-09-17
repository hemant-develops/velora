import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { SubscriptionPurchase } from '@/components/SubscriptionPurchase';
import { LogoutButton } from '@/components/LogoutButton';
import { PLAY_STORE_URL } from '@/lib/constants';

export const metadata: Metadata = { title: 'My Account' };

// Owner: subscription purchase/status + a link to their own store page.
// Customer (or anyone without an owner-verified account yet): a simple
// welcome and a prominent app download push -- per the product decision,
// this site's real purpose for a customer is discovery + getting them onto
// the app, never a second place to actually book/contact an owner.
export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-neutral-500">Account features are temporarily unavailable. Please try again shortly.</p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/account');

  const { data: profile } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle();
  const isOwner = profile?.role === 'owner';
  const displayName = profile?.full_name || user.email || 'there';

  const { data: hasActive } = await supabase.rpc('has_active_subscription', { p_owner_id: user.id });
  const { data: latestSub } = isOwner
    ? await supabase
        .from('owner_subscriptions')
        .select('expires_at')
        .eq('owner_id', user.id)
        .eq('status', 'active')
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Hi, {displayName}</h1>
        <LogoutButton />
      </div>

      {isOwner ? (
        <div className="mt-6 space-y-4">
          <SubscriptionPurchase userEmail={user.email ?? ''} userName={displayName} isActive={!!hasActive} expiresAt={latestSub?.expires_at ?? null} />
          <Link
            href={`/owners/${user.id}`}
            className="block rounded-2xl bg-white p-5 text-center text-sm font-semibold text-neutral-900 ring-1 ring-black/5 transition-colors hover:ring-neutral-300"
          >
            View my public store page
          </Link>
          <p className="text-center text-sm text-neutral-500">List and manage your cars in the VELORA app.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-6 text-center ring-1 ring-black/5">
          <p className="text-sm text-neutral-600">
            You&apos;re signed in on VELORA. Browsing and searching are always free here — to contact an owner and book a car,
            continue in the VELORA app.
          </p>
        </div>
      )}

      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 block h-11 rounded-lg bg-neutral-900 text-center text-sm font-semibold leading-[44px] text-white transition-colors hover:bg-neutral-800"
      >
        Download the VELORA App
      </a>
    </div>
  );
}
