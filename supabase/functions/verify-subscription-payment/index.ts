// VELORA -- verify-subscription-payment Edge Function
//
// The other half of create-subscription-order (read that function's comment
// first). Razorpay Checkout hands the CLIENT back
// { razorpay_order_id, razorpay_payment_id, razorpay_signature } on success --
// but a client claiming "here's a signature, trust me" is worthless on its
// own; anyone could send made-up values. This function independently
// recomputes the expected signature server-side (HMAC-SHA256 of
// "order_id|payment_id" using the Razorpay Key SECRET, which only this
// function ever holds) and ONLY creates the owner_subscriptions row if it
// matches exactly -- the standard, required way to trust a Razorpay
// payment. This is the only code path in the whole project that is allowed
// to write to owner_subscriptions at all (see that table's RLS).
//
// Deploy: supabase functions deploy verify-subscription-payment
// Needs the same secrets as create-subscription-order, plus the service
// role key (same one send-push already uses):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (if not already set)

// @ts-nocheck -- Deno edge runtime; see send-push/index.ts for why.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const SUBSCRIPTION_AMOUNT_PAISE = 100;
const SUBSCRIPTION_DAYS = 90; // "3 months", counted as a fixed 90-day window -- see the migration's own note on why this is a one-time purchase, not a Razorpay recurring Subscription.

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    }

    const { orderId, paymentId, signature } = await req.json();
    if (!orderId || !paymentId || !signature) {
      return new Response(JSON.stringify({ error: 'Missing payment details.' }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    console.log(
      `VELORA_VERIFY_SUB_ENV_CHECK urlPresent=${!!supabaseUrl} anonKeyPresent=${!!anonKey} serviceRoleKeyPresent=${!!serviceRoleKey} razorpayKeySecretPresent=${!!razorpayKeySecret}`,
    );
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !razorpayKeySecret) {
      return new Response(JSON.stringify({ error: 'Server is not configured for subscriptions yet.' }), { status: 500 });
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      console.log(`VELORA_VERIFY_SUB_AUTH_FAILED: ${userError?.message ?? 'no user'}`);
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    }

    // Independent, server-side signature verification -- the entire point
    // of this function. Uses the Web Crypto API (standard in Deno), never a
    // third-party HMAC library.
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(razorpayKeySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expectedSignatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${paymentId}`));
    const expectedSignature = toHex(expectedSignatureBuffer);

    if (expectedSignature !== signature) {
      console.log('VELORA_VERIFY_SUB_SIGNATURE_MISMATCH');
      return new Response(JSON.stringify({ error: 'Payment could not be verified.' }), { status: 400 });
    }

    // Service-role client -- deliberately bypasses owner_subscriptions' RLS
    // (which has no client INSERT grant at all) because this is the one
    // server-verified write path the whole table's security model depends
    // on. Never returns the service-role key or any secret to the caller.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

    const { error: insertError } = await admin.from('owner_subscriptions').insert({
      owner_id: user.id,
      status: 'active',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      amount_paise: SUBSCRIPTION_AMOUNT_PAISE,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      // A unique-violation on razorpay_payment_id means this exact payment
      // was already recorded (e.g. the client retried after a network
      // blip on the first successful call) -- not a real failure, since the
      // subscription this payment paid for already exists.
      if (insertError.code === '23505') {
        console.log('VELORA_VERIFY_SUB_DUPLICATE_PAYMENT_IGNORED');
        return new Response(JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }), { status: 200 });
      }
      console.log(`VELORA_VERIFY_SUB_INSERT_ERROR: ${insertError.message}`);
      return new Response(JSON.stringify({ error: 'Payment verified but activation failed. Please contact support.' }), { status: 500 });
    }

    console.log(`VELORA_VERIFY_SUB_ACTIVATED owner=${user.id}`);
    return new Response(JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.log(`VELORA_VERIFY_SUB_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(JSON.stringify({ error: 'Internal error. Please try again.' }), { status: 500 });
  }
});
