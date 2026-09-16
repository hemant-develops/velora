import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

// PERMISSIONS FEATURE -- real push notifications for booking updates, new
// messages, and reports/wallet events. This is the ONLY genuine, feature-
// backed reason the app asks for the notification permission: nothing here
// fakes a prompt just to "show a permission dialog" with nothing behind it.
//
// Shows the native OS permission dialog (Android 13+/iOS) and, if granted,
// registers this device for push and saves its Expo push token to Supabase
// so a future server-side sender (an Edge Function reacting to new rows in
// bookings/chat_messages/notifications) can actually deliver to it. Safe to
// call every login -- `requestPermissionsAsync` is a no-op prompt-wise once
// the person has already answered, and the upsert below just refreshes the
// token/timestamp.
export const registerForPushNotifications = async (userId: string): Promise<void> => {
  try {
    // PUSH-NOTIFICATION-AUDIT DIAGNOSTIC LOGS -- these never print the token
    // value itself (see VELORA_PUSH_TOKEN_RECEIVED below), only whether each
    // stage of registration was reached, so logcat can show exactly where
    // this pipeline breaks for a given device without exposing anything
    // sensitive.
    console.log('VELORA_PUSH_REGISTER_START');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') {
      console.log('VELORA_PUSH_PERMISSION_DENIED');
      return;
    }
    console.log('VELORA_PUSH_PERMISSION_GRANTED');

    // `projectId` is read from app.json's extra.eas.projectId automatically
    // in an EAS/dev-client build, so nothing needs to be passed explicitly
    // here -- this stays correct across dev-client and production builds.
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse?.data;
    if (!token) return;
    console.log('VELORA_PUSH_TOKEN_RECEIVED');

    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      console.log(`VELORA_PUSH_TOKEN_SAVE_ERROR: ${error.message}`);
    } else {
      console.log('VELORA_PUSH_TOKEN_SAVED');
    }
  } catch (err) {
    // Never let a permission/token hiccup affect login -- this whole flow is
    // best-effort, matching logUserSession's fire-and-forget contract.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log(`VELORA_PUSH_REGISTER_ERROR: ${message}`);
  }
};
