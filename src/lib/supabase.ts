import 'react-native-url-polyfill/auto';
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