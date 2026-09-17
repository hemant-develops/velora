// VELORA -- create-subscription-order Edge Function
//
// What this closes: the owner subscription flow (0026_owner_subscriptions.sql)
// needs to create a real Razorpay order before Checkout can open, and
// creating a Razorpay order requires Basic-Auth with the Key SECRET --
// something that must never exist in the mobile app or the public website's
// client-side code (both only ever hold the public Key ID). This function
// is the one place the secret is used, exactly the same shape send-push
// uses SUPABASE_SERVICE_ROLE_KEY: read from this function's own Edge
// Function environment (set via `supabase secrets set`, never committed),
// never returned to the caller.
//
// Deploy: supabase functions deploy create-subscription-order
// One-time secret setup (run once from a machine with the Supabase CLI):
//   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
//   supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
// (Key ID is not secret -- it's also the same value the app/website embed
// publicly as EXPO_PUBLIC_RAZORPAY_KEY_ID / NEXT_PUBLIC_RAZORPAY_KEY_ID --
// but it's read from here too so this function never has to trust a
// caller-supplied key id.)
//
// Called by an already-signed-in owner (mobile app or the public website),
// passing their Supabase session's access token as the Authorization
// header -- supabase-js's functions.invoke() does this automatically. This
// function verifies that token itself (never trusts a caller-supplied user
// id) before creating anything.

// @ts-nocheck -- Deno edge runtime; see send-push/index.ts for why.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

// Introductory pricing per the product decision -- ₹1 for a 3-month window.
// Deliberately a plain constant (not caller-supplied) so nobody can request
// an order for a different amount than what this function actually verifies
// and grants later in verify-subscription-payment.
const SUBSCRIPTION_AMOUNT_PAISE = 100; // ₹1.00
const SUBSCRIPTION_CURRENCY = 'INR';

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    console.log(
      `VELORA_CREATE_SUB_ORDER_ENV_CHECK urlPresent=${!!supabaseUrl} anonKeyPresent=${!!anonKey} razorpayKeyIdPresent=${!!razorpayKeyId} razorpayKeySecretPresent=${!!razorpayKeySecret}`,
    );
    if (!supabaseUrl || !anonKey || !razorpayKeyId || !razorpayKeySecret) {
      return new Response(JSON.stringify({ error: 'Server is not configured for subscriptions yet.' }), { status: 500 });
    }

    // Verifies the token itself -- this is what stops any caller from
    // pretending to be a different owner_id (the returned order carries no
    // owner_id anyway, but the *authenticated-ness* is what gates this
    // function from being called by a signed-out visitor at all).
    const authClient = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      console.log(`VELORA_CREATE_SUB_ORDER_AUTH_FAILED: ${userError?.message ?? 'no user'}`);
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    }

    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: SUBSCRIPTION_AMOUNT_PAISE,
        currency: SUBSCRIPTION_CURRENCY,
        // Razorpay requires this to be <= 40 chars.
        receipt: `sub_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { purpose: 'owner_subscription', owner_id: user.id },
      }),
    });

    const razorpayResult = await razorpayResponse.json();
    console.log(`VELORA_CREATE_SUB_ORDER_RAZORPAY_RESPONSE httpStatus=${razorpayResponse.status} orderId=${razorpayResult?.id ?? 'none'}`);

    if (!razorpayResponse.ok || !razorpayResult?.id) {
      return new Response(JSON.stringify({ error: 'Could not start the payment. Please try again.' }), { status: 502 });
    }

    return new Response(
      JSON.stringify({
        orderId: razorpayResult.id,
        amount: SUBSCRIPTION_AMOUNT_PAISE,
        currency: SUBSCRIPTION_CURRENCY,
        keyId: razorpayKeyId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.log(`VELORA_CREATE_SUB_ORDER_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(JSON.stringify({ error: 'Internal error. Please try again.' }), { status: 500 });
  }
});
