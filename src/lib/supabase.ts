import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL environment variable.',
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable.',
  );
}

// M6 Step 1 -- prepares Supabase Auth's session storage for React Native
// (there is no browser localStorage here, which is what the client
// defaults to) so a real Supabase Auth session persists across app restarts
// and refreshes itself in the background. Stale-comment fix (final
// verification): as of M6 Step 3, AuthContext.tsx IS real Supabase Auth --
// login/signup/logout/session-restore/email-confirmation deep links all go
// through supabase.auth.* (see AuthContext.tsx), configured here with this
// exact storage/persistSession/autoRefreshToken setup.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// PRODUCTION-AUDIT FIX -- root cause of intermittent "we couldn't save your
// changes right now" errors (most visible on Edit Car, since taking/picking
// a photo backgrounds the app to Camera/Gallery and back, but not limited to
// it -- any save shortly after the app returns from background was at risk).
//
// `autoRefreshToken: true` alone is NOT sufficient on React Native: Supabase
// schedules the next token refresh with a JS timer, and JS timers are
// throttled/suspended while the app is backgrounded. Per Supabase's own
// React Native setup docs, the client must be told explicitly when the app
// is foregrounded/backgrounded so it can pause/resume that refresh cycle --
// without this, a session can sit with a quietly-expired access token after
// any real-world background period (not just editing a car -- switching
// apps, taking a call, the phone locking), and the next request fails
// authorization, which every write path here (car save, booking, chat
// message, profile update, ...) surfaces as its own generic error message.
// This fixes the shared root cause for all of them at once, with no change
// to RLS, schema, or auth configuration.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});