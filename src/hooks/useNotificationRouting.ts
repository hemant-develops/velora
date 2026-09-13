import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { navigateToNotificationTarget } from '../navigation/navigationRef';

// PERMISSIONS FEATURE -- completes the real push-notification pipeline
// (registerForPushNotifications -> notify()/create_notification -> the
// send-push Edge Function, see that function's own comment for the one-time
// Supabase Dashboard wiring it still needs). Two things were still missing
// on the client, both defaults that don't fit an app people actually rely on
// to hear about a new message or a booking update in real time:
//
// 1. By default, expo-notifications does NOT show a banner for a push that
//    arrives while the app is already open/foregrounded -- it silently
//    updates the notification tray in the background only. That means a
//    renter mid-session in VELORA would never see "New message from ..."
//    pop up at all unless they back out to the home screen first. Setting a
//    handler here makes a push show as a real system banner every time,
//    foreground or not (background/killed already worked).
// 2. Tapping a delivered push did nothing -- it just opened the app to
//    wherever it already was. This adds the missing deep-link: the
//    Edge Function's payload already carries targetKind/targetId (see
//    send-push/index.ts), so a tapped "Booking confirmed" push now opens
//    that booking directly, same as tapping it in the in-app Notifications
//    list already does.
// Typed loosely (not `Notifications.NotificationResponse`) so this doesn't
// depend on exactly which expo-notifications minor version is installed --
// both callers below (the live listener and the cold-launch check) hand it
// the same shape regardless.
const routeFromResponse = (response: { notification: { request: { content: { data?: { targetKind?: string; targetId?: string } } } } } | null | undefined) => {
  const data = response?.notification.request.content.data;
  if (data?.targetKind && data?.targetId) {
    navigateToNotificationTarget({ kind: data.targetKind, id: data.targetId });
  }
};

export const useNotificationRouting = (): void => {
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Covers tapping a push while VELORA is already running or backgrounded.
    const subscription = Notifications.addNotificationResponseReceivedListener(routeFromResponse);

    // Covers the OTHER real case: the OS relaunching a fully-KILLED VELORA
    // because someone tapped a push (the most likely reason anyone taps one
    // in the first place). addNotificationResponseReceivedListener never
    // fires for that launch -- it's only wired up after this component has
    // already mounted -- so without this, tapping a push notification when
    // the app wasn't open at all would silently just open the app to
    // wherever it starts, instead of the booking/conversation it's about.
    Notifications.getLastNotificationResponseAsync()
      .then(routeFromResponse)
      .catch((err) => {
        console.log(`VELORA_LAST_NOTIFICATION_RESPONSE_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });

    return () => subscription.remove();
  }, []);
};
