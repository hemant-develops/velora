// VELORA -- send-push Edge Function
//
// What this closes: registerForPushNotifications() (src/utils/pushNotifications.ts)
// already asks for the real notification permission and saves each device's
// Expo push token to public.push_tokens. Every real in-app event (a booking
// created/confirmed/rejected/cancelled, a new chat message) already calls
// notify(), which inserts a row into public.notifications via the
// create_notification RPC -- see src/context/NotificationsContext.tsx.
//
// This function is the missing last hop: given ONE new notifications row, it
// looks up that user's saved push token and actually sends the push via
// Expo's push API, so the phone gets a real OS notification even when VELORA
// isn't open. Wire it up with a Supabase Database Webhook (steps below) --
// no code changes needed elsewhere, and no new client-side work.
//
// Deploy: supabase functions deploy send-push
//
// Wire it up (Supabase Dashboard, one-time, ~1 minute):
//   Database -> Webhooks -> Create a new webhook
//     Name:            notify_push
//     Table:           public.notifications
//     Events:          Insert
//     Type:            Supabase Edge Function
//     Edge Function:   send-push
//   Save. That's it -- every future notify() call now also fires a real push.
//
// This function is intentionally best-effort: if a user has no saved push
// token yet (never granted the permission, or hasn't logged in since this
// feature shipped), it just skips them -- it never throws, so it can never
// break the notification/booking/message flow that triggered it.

// @ts-nocheck -- Deno edge runtime; not part of the app's own TypeScript
// project (see tsconfig.json), so it isn't checked by `npx tsc` alongside
// the React Native app and doesn't have its Deno ambient types here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // Supabase Database Webhooks send { type, table, record, old_record, schema }.
    const record = payload.record ?? payload.new ?? payload;
    const userId = record?.user_id;
    const title = record?.title ?? 'VELORA';
    const message = record?.message ?? '';
    // DIAGNOSTIC -- confirms the webhook payload actually reached this
    // function and had a user_id, without logging the notification's own
    // title/message content.
    console.log(`VELORA_SEND_PUSH_INVOKED hasUserId=${!!userId} type=${record?.type ?? 'unknown'}`);
    if (!userId) {
      return new Response(JSON.stringify({ skipped: 'no user_id in payload' }), { status: 200 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // DIAGNOSTIC -- reports ONLY whether each required env var is present
    // (true/false); never logs the actual URL or key value.
    console.log(`VELORA_SEND_PUSH_ENV_CHECK supabaseUrlPresent=${!!supabaseUrl} serviceRoleKeyPresent=${!!serviceRoleKey}`);
    if (!supabaseUrl || !serviceRoleKey) {
      console.log('VELORA_SEND_PUSH_MISSING_ENV');
      return new Response(JSON.stringify({ error: 'missing env' }), { status: 500 });
    }

    // Service-role client -- deliberately bypasses push_tokens' RLS (which
    // otherwise only lets a user read their OWN token) because this function
    // runs server-side on behalf of the platform, not on behalf of any one
    // signed-in user; it never returns the token to a client, only to Expo.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokenRow, error } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.log(`VELORA_SEND_PUSH_TOKEN_LOOKUP_ERROR: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), { status: 200 });
    }
    // DIAGNOSTIC -- confirms whether a saved token row was actually found
    // for this user_id; never logs the token value itself.
    console.log(`VELORA_SEND_PUSH_TOKEN_LOOKUP_OK found=${!!tokenRow?.token}`);
    if (!tokenRow?.token) {
      // Normal, common case -- this person hasn't granted the notification
      // permission (or hasn't logged in since it shipped). Not an error.
      return new Response(JSON.stringify({ skipped: 'no push token for user' }), { status: 200 });
    }

    // PHASE 5 -- Notification Settings (see 0006_notification_preferences.sql).
    // The muted notification row still exists and still shows up in the
    // in-app Notifications inbox -- this only decides whether to also buzz
    // the phone. Swallowing any lookup error (instead of failing the
    // request) means an un-migrated project (no push_enabled/notify_bookings/
    // notify_messages columns yet) just skips this check and falls through
    // to "send the push", exactly like before this migration existed --
    // same fail-open shape already used for the token lookup above.
    const notificationType = record?.type as string | undefined;
    const { data: prefsRow } = await admin
      .from('profiles')
      .select('push_enabled, notify_bookings, notify_messages')
      .eq('id', userId)
      .maybeSingle();
    if (prefsRow) {
      const bookingTypes = ['booking_created', 'booking_status'];
      const categoryEnabled =
        notificationType === 'message'
          ? prefsRow.notify_messages !== false
          : bookingTypes.includes(notificationType ?? '')
            ? prefsRow.notify_bookings !== false
            : true; // an unrecognized/future type is never silently muted
      if (prefsRow.push_enabled === false || !categoryEnabled) {
        console.log('VELORA_SEND_PUSH_MUTED_BY_PREFS');
        return new Response(JSON.stringify({ skipped: 'muted by notification preferences' }), { status: 200 });
      }
    }

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: tokenRow.token,
        title,
        body: message,
        data: {
          targetKind: record?.target_kind ?? null,
          targetId: record?.target_id ?? null,
          notificationType: record?.type ?? null,
        },
      }),
    });
    const expoResult = await expoResponse.json();
    // DIAGNOSTIC -- Expo's own HTTP status and response body for this push
    // ticket. Safe to log in full: it's Expo's own delivery-status reply
    // (e.g. { data: { status: 'ok' } } or a DeviceNotRegistered/InvalidCredentials
    // error), not a secret -- this is exactly what distinguishes "Expo
    // accepted it" from "Expo rejected it" per the audit's point F/#15.
    console.log(`VELORA_SEND_PUSH_EXPO_RESPONSE httpStatus=${expoResponse.status} body=${JSON.stringify(expoResult)}`);

    // BUG FIX -- a DeviceNotRegistered response means Expo/the OS has
    // permanently invalidated this token (app uninstalled, permission
    // revoked at the OS level, etc.) -- every future push to this user was
    // silently failing forever with nothing ever clearing the stale row.
    // Blanking it (same convention AuthContext.logout() already uses, not a
    // delete) makes this user look "unregistered" until their next
    // successful registerForPushNotifications() call saves a fresh token.
    const ticket = expoResult?.data;
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      console.log(`VELORA_SEND_PUSH_STALE_TOKEN_CLEARED user=${userId}`);
      const { error: clearError } = await admin.from('push_tokens').update({ token: '' }).eq('user_id', userId);
      if (clearError) {
        console.log(`VELORA_SEND_PUSH_STALE_TOKEN_CLEAR_ERROR: ${clearError.message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, expoResult }), { status: 200 });
  } catch (err) {
    console.log(`VELORA_SEND_PUSH_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    // Always 200 -- a push-sending hiccup must never make the DB webhook
    // retry-storm or surface as a failure anywhere in the app itself.
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 200 });
  }
});
