import { Alert, Platform, ToastAndroid } from 'react-native';

// Lightweight, non-blocking feedback after an action (e.g. toggling a car's
// Active/Inactive state). Velora's tested/shipped target is Android, where
// the platform's own ToastAndroid gives a proper transient toast for free —
// no extra dependency needed. Other platforms fall back to a plain alert so
// the feedback is never silently dropped, even though it's not the ideal
// non-blocking UX there.
export const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
};
