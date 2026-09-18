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

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

// Same slugify rule as public.slugify() (0028_owner_stores.sql) --
// duplicated here (not called via RPC) because upsert_owner_store() keys
// off auth.uid(), which is null under this function's service-role client;
// this function has no authenticated-user session, only the owner_id it
// already verified above, so it inserts owner_stores directly instead.
const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// FIRST-SUBSCRIPTION STOREFRONT -- "every subscription-active owner gets a
// proper digital storefront" from the product spec, automatically, not as
// a manual second step. Only ever runs once per owner (guarded by checking
// for an existing row first) -- an owner who already has a store (from a
// previous subscription, or from editing it via the app's Store Settings
// screen) keeps their existing store_name/slug untouched on a renewal.
const ensureOwnerStore = async (admin: ReturnType<typeof createClient>, ownerId: string): Promise<void> => {
  const { data: existing } = await admin.from('owner_stores').select('owner_id').eq('owner_id', ownerId).maybeSingle();
  if (existing) return;

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', ownerId).maybeSingle();
  const baseName = profile?.full_name ? `${profile.full_name}'s Cars` : 'My VELORA Store';
  const baseSlug = slugify(baseName) || 'store';

  let candidateSlug = baseSlug;
  let suffix = 1;
  // Service-role bypasses RLS, so this can see every existing slug to check
  // availability -- the same reason upsert_owner_store() (the owner's own
  // later edits) is SECURITY DEFINER rather than a plain RLS-scoped insert.
  while (true) {
    const { data: collision } = await admin.from('owner_stores').select('owner_id').eq('slug', candidateSlug).maybeSingle();
    if (!collision) break;
    suffix += 1;
    candidateSlug = `${baseSlug}-${suffix}`;
  }

  const { error: storeError } = await admin.from('owner_stores').insert({ owner_id: ownerId, store_name: baseName, slug: candidateSlug });
  if (storeError) {
    // Best-effort -- a failure here must never fail the subscription
    // activation itself (the payment already succeeded and is verified;
    // the owner can still create/edit their store manually afterwards).
    console.log(`VELORA_VERIFY_SUB_STORE_CREATE_ERROR: ${storeError.message}`);
  } else {
    console.log(`VELORA_VERIFY_SUB_STORE_CREATED owner=${ownerId} slug=${candidateSlug}`);
  }
};

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
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    console.log(
      `VELORA_VERIFY_SUB_ENV_CHECK urlPresent=${!!supabaseUrl} anonKeyPresent=${!!anonKey} serviceRoleKeyPresent=${!!serviceRoleKey} razorpayKeyIdPresent=${!!razorpayKeyId} razorpayKeySecretPresent=${!!razorpayKeySecret}`,
    );
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !razorpayKeyId || !razorpayKeySecret) {
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

    // CONFIGURABLE PRICING -- what this payment actually paid for (amount,
    // and which plan_id) is read back from RAZORPAY'S OWN order record, not
    // from anything the client sent. A verified signature only proves "this
    // payment_id genuinely belongs to this order_id" -- it says nothing
    // about which VELORA plan that order was created for, so trusting a
    // client-supplied plan_id here would let someone who genuinely paid for
    // the cheapest plan claim a longer/different one. create-subscription-
    // order stamped `notes.plan_id` on the order at creation time
    // specifically so this function can read it back authoritatively.
    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    const order = await orderResponse.json();
    const planId = order?.notes?.plan_id;
    const amountPaise = order?.amount;
    const orderOwnerId = order?.notes?.owner_id;
    const orderPurpose = order?.notes?.purpose;
    const orderCurrency = order?.currency;
    console.log(
      `VELORA_VERIFY_SUB_ORDER_LOOKUP httpStatus=${orderResponse.status} planId=${planId ?? 'none'} amountPresent=${amountPaise != null} ownerMatches=${orderOwnerId === user.id}`,
    );
    if (
      !orderResponse.ok ||
      !planId ||
      amountPaise == null ||
      orderPurpose !== 'owner_subscription' ||
      orderOwnerId !== user.id ||
      orderCurrency !== 'INR'
    ) {
      return new Response(JSON.stringify({ error: 'Could not confirm the plan for this payment. Please contact support.' }), { status: 500 });
    }

    const authedForPlan = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: plan, error: planError } = await authedForPlan
      .from('subscription_plans')
      .select('price_paise, duration_days')
      .eq('id', planId)
      .maybeSingle();
    if (planError || !plan) {
      console.log(`VELORA_VERIFY_SUB_PLAN_LOOKUP_ERROR: ${planError?.message ?? 'plan not found'}`);
      return new Response(JSON.stringify({ error: 'Could not confirm the plan for this payment. Please contact support.' }), { status: 500 });
    }
    if (Number(plan.price_paise) !== Number(amountPaise)) {
      console.log(`VELORA_VERIFY_SUB_AMOUNT_MISMATCH planId=${planId}`);
      return new Response(JSON.stringify({ error: 'Payment amount does not match the active plan.' }), { status: 400 });
    }

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    const payment = await paymentResponse.json();
    if (
      !paymentResponse.ok ||
      payment?.order_id !== orderId ||
      payment?.currency !== 'INR' ||
      Number(payment?.amount) !== Number(amountPaise) ||
      payment?.status !== 'captured'
    ) {
      console.log(
        `VELORA_VERIFY_SUB_PAYMENT_REJECTED httpStatus=${paymentResponse.status} orderMatches=${payment?.order_id === orderId} status=${payment?.status ?? 'none'}`,
      );
      return new Response(JSON.stringify({ error: 'Payment has not been captured or does not match this order.' }), { status: 400 });
    }

    // Service-role client -- deliberately bypasses owner_subscriptions' RLS
    // (which has no client INSERT grant at all) because this is the one
    // server-verified write path the whole table's security model depends
    // on. Never returns the service-role key or any secret to the caller.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

    const { data: existingOrder, error: existingOrderError } = await admin
      .from('owner_subscriptions')
      .select('owner_id, razorpay_payment_id, expires_at')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    if (existingOrderError) {
      console.log(`VELORA_VERIFY_SUB_REPLAY_LOOKUP_ERROR: ${existingOrderError.message}`);
      return new Response(JSON.stringify({ error: 'Could not confirm whether this payment was already activated.' }), { status: 500 });
    }
    if (existingOrder) {
      if (existingOrder.owner_id === user.id && existingOrder.razorpay_payment_id === paymentId) {
        return new Response(JSON.stringify({ success: true, expiresAt: existingOrder.expires_at }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'This payment order has already been processed.' }), { status: 409 });
    }

    const { error: insertError } = await admin.from('owner_subscriptions').insert({
      owner_id: user.id,
      status: 'active',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      plan_id: planId,
      amount_paise: amountPaise,
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
        await ensureOwnerStore(admin, user.id);
        return new Response(JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }), { status: 200 });
      }
      console.log(`VELORA_VERIFY_SUB_INSERT_ERROR: ${insertError.message}`);
      return new Response(JSON.stringify({ error: 'Payment verified but activation failed. Please contact support.' }), { status: 500 });
    }

    await ensureOwnerStore(admin, user.id);
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
