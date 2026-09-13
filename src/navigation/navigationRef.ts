import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

// A ref to the app's single NavigationContainer (wired up in
// AppNavigation.tsx), so code OUTSIDE the component tree -- a push
// notification tap handler, the in-app notification popup below -- can
// still navigate. Without this, only screens that receive `navigation` as a
// prop could route anywhere, which a background event listener never does.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export interface NotificationTarget {
  kind: string;
  id: string;
}

// The one place that maps a notification's target to a screen -- shared by
// the push-notification tap handler (useNotificationRouting.ts) and the
// in-app popup (NotificationsContext.tsx), so both open the exact same
// screen NotificationsScreen.onPressItem already opens for this target.
// Silently does nothing if the target kind is unrecognized.
//
// `attemptsLeft` handles a real cold-launch race: when the OS relaunches a
// fully-killed VELORA because someone tapped a push notification, this can
// get called before NavigationContainer has finished mounting (it lives
// deep inside AuthProvider/etc., which itself waits on the auth check --
// see AppNavigation.tsx). Dropping the navigation there would silently
// swallow exactly the case the person cares about most -- tapping a push
// when the app wasn't even open. Retry briefly instead; once ready it fires
// immediately as before, and this only ever matters on that cold-start path.
export const navigateToNotificationTarget = (
  target: NotificationTarget | null | undefined,
  attemptsLeft = 20,
) => {
  if (!target) return;
  if (!navigationRef.isReady()) {
    if (attemptsLeft <= 0) return; // ~3s of retrying -- give up rather than loop forever
    setTimeout(() => navigateToNotificationTarget(target, attemptsLeft - 1), 150);
    return;
  }
  if (target.kind === 'booking') {
    navigationRef.navigate('BookingDetails', { bookingId: target.id });
  } else if (target.kind === 'car') {
    navigationRef.navigate('CarDetails', { carId: target.id });
  } else if (target.kind === 'conversation') {
    navigationRef.navigate('ConversationDetail', { conversationId: target.id });
  }
};
