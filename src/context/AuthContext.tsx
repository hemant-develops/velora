import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppUser, OwnerVerification, PhoneVerification, UserRole } from '../types';
import { avatars } from '../data/images';
import { isValidEmail, isValidOtp, toE164IndianPhone } from '../utils/format';
import { storage } from '../utils/storage';
import { registerForPushNotifications } from '../utils/pushNotifications';

// Final-verification fix -- phone/bio/location/locationSource have no
// confirmed backing column in `profiles` (see the comment on
// loadUserFromSession below), so they only ever lived in React state. That
// meant they silently reset to blank on every full app restart (not just a
// background/foreground cycle) -- in particular, this quietly broke M9's
// "Near Me" quick filter on every cold start, since it depends entirely on
// `user.location` being set. Persisting them here, on device only (never
// sent to Supabase), keeps them intact across restarts without requiring a
// schema change. ownerVerification is NOT cached here (SECURITY FIX,
// 0020_owner_verifications.sql) -- it now has a real server-side source of
// truth and is always freshly fetched, never trusted from an on-device copy.
const AUTH_PROFILE_EXTRAS_KEY = 'velora.authProfileExtras.v1';

interface ProfileExtras {
  phone?: string;
  bio?: string;
  location?: string;
  locationSource?: 'gps' | 'manual';
  preferredPaymentMethod?: AppUser['preferredPaymentMethod'];
}

// Email-confirmation deep link. Must match app.json's `expo.scheme` ("velora")
// and the Redirect URLs entry configured in the Supabase dashboard.
const AUTH_CALLBACK_URL = 'velora://auth-callback';

// Supabase's confirmation-link redirect can land tokens either in the URL
// fragment (`#access_token=...&refresh_token=...`, the default "implicit"
// flow) or in the query string (`?code=...`, the "pkce" flow, or
// `?error=...` on failure) -- this project doesn't set `flowType` so it's on
// the implicit default, but parsing both keeps this correct even if that's
// changed later. Built with plain string ops (not `new URL(...)`) since a
// custom, non-`http(s)` scheme like `velora://` isn't guaranteed to parse
// predictably across URL polyfills.
const parseAuthCallbackParams = (url: string): URLSearchParams => {
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    return new URLSearchParams(url.substring(hashIndex + 1));
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    return new URLSearchParams(url.substring(queryIndex + 1));
  }
  return new URLSearchParams();
};

export interface AuthResult {
  success: boolean;
  error?: string;
  // A non-blocking heads-up shown alongside a successful result — e.g. when
  // someone picked "List My Car" at Login but their account isn't a
  // verified owner yet, so they were logged in as their existing role
  // instead of being silently switched to Owner Mode.
  info?: string;
  // FLAGGED MINIMAL ADDITION: the new user's id, set only by `signup()` on a
  // successful sign-up that issued an immediate session (Supabase demo
  // config here confirms without an email step, so this is the normal
  // path). This does not change any auth/security/session logic — it only
  // surfaces an id the call already had, so SignupScreen can hand it to
  // RewardsContext.redeemReferralCode() right after signup without a
  // second lookup or any new backend call.
  userId?: string;
}

export interface OwnerVerificationInput {
  fullName: string;
  phone: string;
  idType: string;
  idNumber: string;
  // Storage path returned by uploadOwnerIdDocument (private
  // owner-id-documents bucket) -- uploaded BEFORE this is called, since the
  // RPC only stores the path, not the file itself.
  idDocumentPath: string;
}

interface AuthContextValue {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, role?: UserRole) => Promise<AuthResult>;
  signup: (params: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: UserRole;
  }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  deactivateAccount: () => Promise<AuthResult>;
  refreshSubscriptionStatus: () => Promise<void>;
  createSubscriptionOrder: () => Promise<
    { success: true; orderId: string; amount: number; currency: string; keyId: string } | { success: false; error: string }
  >;
  verifySubscriptionPayment: (params: { orderId: string; paymentId: string; signature: string }) => Promise<AuthResult>;
  updateProfile: (patch: Partial<AppUser>) => Promise<boolean>;
  switchRole: (role: UserRole) => Promise<AuthResult>;
  // FLAGGED MINIMAL ADDITION: a real "Forgot Password" call, replacing what
  // was previously a fully local mock that always claimed success without
  // ever contacting Supabase (ForgotPasswordScreen used to just flip a
  // `sent` boolean). This calls Supabase Auth's standard, built-in
  // `resetPasswordForEmail` -- the same auth client and the same
  // AUTH_CALLBACK_URL redirect already used by signup's confirmation email
  // -- so it needs no new schema, RLS policy, or SECURITY DEFINER function,
  // and touches no existing login/signup/session logic.
  resetPassword: (email: string) => Promise<AuthResult>;
  // SECURITY FIX -- resetPassword() above only ever sent the recovery email;
  // nothing in this app previously called Supabase Auth's own
  // updateUser({password}) to actually apply a new one, so clicking the
  // email link signed the user back into the app without ever changing
  // their password. passwordRecoveryPending flips true the moment
  // onAuthStateChange reports Supabase's own 'PASSWORD_RECOVERY' event (set
  // only when the current session came from a recovery link, never from a
  // normal login/signup/email-confirmation) so AppNavigation can show
  // SetNewPasswordScreen instead of dropping the person straight into the
  // app on an unchanged password.
  passwordRecoveryPending: boolean;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  // PHONE/OTP LOGIN -- uses Supabase Auth's own signInWithOtp/verifyOtp
  // (phone provider + SMS delivery already configured in the Supabase
  // dashboard, e.g. via Twilio -- no credential of any kind lives in this
  // app). Does not touch email/password login at all; this is an
  // additional sign-in method on the same auth.users table. Neither
  // function sets `user` state directly -- verifyPhoneOtp's successful
  // supabase.auth.verifyOtp() call establishes a real session the same way
  // signInWithPassword does, and the existing onAuthStateChange listener
  // (already subscribed, already the single source of truth) picks it up
  // via loadUserFromSession exactly like every other sign-in path.
  sendPhoneOtp: (phone: string) => Promise<AuthResult>;
  verifyPhoneOtp: (phone: string, otp: string) => Promise<AuthResult>;
  // PHONE IDENTITY BINDING -- for an already-signed-in email/Google session
  // to bind/verify a phone onto THAT SAME account (see the functions' own
  // comments for why this needs Supabase's separate phone_change API, not
  // the sign-in one above). Duplicate-phone rejection is enforced by
  // public.phone_identities' unique constraint, never client-side alone.
  sendPhoneBindOtp: (phone: string) => Promise<AuthResult>;
  verifyPhoneBindOtp: (phone: string, otp: string) => Promise<AuthResult>;
  refreshPhoneVerificationStatus: () => Promise<void>;
  // PRODUCT IMPROVEMENT -- backs the new EmailVerificationModal's "Resend"
  // action. Uses Supabase Auth's own built-in resend endpoint (the same
  // rate-limited, server-managed flow as the original confirmation email) --
  // no new schema, RPC, or RLS needed, and the same `emailRedirectTo` as
  // signup so a resent link lands back in this app identically.
  resendVerificationEmail: (email: string) => Promise<AuthResult>;
  // SECURITY FIX -- now a real, server-reviewed submission (see
  // submit_owner_verification RPC) instead of an instant client-side
  // approve. Returns success/error so the screen can show the real result
  // (e.g. "this ID is already linked to another account") instead of
  // always succeeding.
  submitOwnerVerification: (input: OwnerVerificationInput) => Promise<AuthResult>;
  refreshOwnerVerificationStatus: () => Promise<void>;
  getUserById: (id: string) => AppUser | undefined;
  // Final non-payment hardening -- resolves another user's PUBLIC-safe
  // profile (name/avatar only) via the get_public_profile RPC, for the
  // screens that legitimately need to show someone other than the signed-in
  // user (OwnerPublicProfileScreen, CustomerProfileScreen, CarDetails'
  // "Listed by" row). Async because it's a network call, unlike the
  // synchronous getUserById cache read above -- see usePublicProfile.
  fetchPublicProfile: (id: string) => Promise<AppUser | undefined>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isVerifiedOwner = (u: AppUser | undefined | null) => u?.ownerVerification?.status === 'verified';

// M6 Step 3 -- real Supabase Auth. `profiles.role` in the DB is
// 'customer' | 'owner' (confirmed default 'customer'), but the app's own
// UserRole type has always been 'renter' | 'owner' -- this is the one place
// that translates between the two, in both directions.
const dbRoleToAppRole = (dbRole: string | null | undefined): UserRole => (dbRole === 'owner' ? 'owner' : 'renter');
const appRoleToDbRole = (role: UserRole): string => (role === 'owner' ? 'owner' : 'customer');

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  deleted_at: string | null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  // Confirmed RLS (profiles_select_own: id = auth.uid() only) means a
  // client can never legitimately fetch another user's profile row -- so
  // this cache only ever ends up holding the signed-in user's own profile.
  // getUserById() below reads synchronously from this cache, which is why
  // it can only ever resolve the current user -- see getUserById's own
  // comment further down, and the M9/M10 reports, for the consumer-facing
  // impact of this (OwnerPublicProfileScreen, CustomerProfileScreen, and
  // CarDetailsScreen's "Listed by" row all still fall back to "not found"
  // for anyone but yourself).
  const profileCacheRef = useRef<Map<string, AppUser>>(new Map());
  // Loaded once on mount (see the effect below) -- the on-device fallback
  // for the fields `profiles` has no confirmed column for. `base` (current
  // in-memory state, when present) always wins over this, since it's always
  // at least as fresh; this only matters right after a cold start, before
  // `base` exists yet.
  const profileExtrasRef = useRef<Record<string, ProfileExtras>>({});
  // Final non-payment hardening -- separate from profileCacheRef (which
  // only ever holds the signed-in user's OWN full profile) so a public,
  // deliberately-partial lookup of someone else can never be confused with
  // or overwrite your own richer cached profile. Populated only by
  // fetchPublicProfile below.
  const publicProfileCacheRef = useRef<Map<string, AppUser>>(new Map());

  const loadUserFromSession = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      return;
    }
    const authUser = session.user;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, deleted_at')
      .eq('id', authUser.id)
      .maybeSingle();
    const profile = data as ProfileRow | null;

    if (error) {
      console.log(`VELORA_AUTH_PROFILE_LOAD_ERROR: ${error.message}`);
    }

    // ACCOUNT DELETION FIX -- confirmed root cause of "deleted account can
    // just log back in": nothing server-side previously recorded that this
    // account had been deleted (see deactivate_own_account() /
    // 0023_account_deletion.sql), so a session establishing successfully via
    // real Supabase Auth is not, on its own, proof this account should still
    // be usable. Checked here, on every session load/restore (cold start AND
    // a fresh sign-in), so a deleted account is force-signed-out again the
    // moment it's detected rather than only at the point of deletion.
    if (profile?.deleted_at) {
      await supabase.auth.signOut();
      setUser(null);
      Alert.alert('Account deleted', 'This account has been deleted and can no longer be used. Contact support if this was a mistake.');
      return;
    }

    // SECURITY FIX -- owner verification now comes from the real, admin-
    // reviewed public.owner_verifications table (0020_owner_verifications.sql),
    // not an on-device cache. There is no more "role already says owner so
    // treat as instantly verified" fallback -- that fallback was the exact
    // client-side-trust gap this migration closes. An account with
    // role='owner' but no row here (e.g. one created before this shipped)
    // now correctly shows 'none' and needs to actually complete
    // verification, same as everyone else.
    const [ownerVerification, phoneVerification, subscription] = await Promise.all([
      fetchOwnerVerification(authUser.id),
      fetchPhoneVerification(authUser.id),
      fetchSubscriptionStatus(authUser.id),
    ]);

    const extras = profileExtrasRef.current[authUser.id];

    setUser((prev) => {
      const base = prev && prev.id === authUser.id ? prev : undefined;
      const role = dbRoleToAppRole(profile?.role);
      const nextUser: AppUser = {
        id: authUser.id,
        name: profile?.full_name || base?.name || (authUser.email ? authUser.email.split('@')[0] : 'User'),
        email: authUser.email ?? base?.email ?? '',
        // Not backed by a confirmed `profiles` column -- restored from the
        // on-device extras cache (see AUTH_PROFILE_EXTRAS_KEY above) when
        // there's no fresher in-memory value yet.
        phone: base?.phone ?? extras?.phone,
        createdAt: authUser.created_at ?? base?.createdAt,
        bio: base?.bio ?? extras?.bio,
        location: base?.location ?? extras?.location ?? '',
        locationSource: base?.locationSource ?? extras?.locationSource,
        preferredPaymentMethod: base?.preferredPaymentMethod ?? extras?.preferredPaymentMethod,
        avatar: profile?.avatar_url || base?.avatar || avatars.abhishek,
        role,
        ownerVerification,
        phoneVerification,
        subscriptionActive: subscription.active,
        subscriptionExpiresAt: subscription.expiresAt,
      };
      profileCacheRef.current.set(nextUser.id, nextUser);
      return nextUser;
    });
  };

  // PHONE IDENTITY BINDING -- reads the caller's own row from
  // public.phone_identities (RLS: user_id = auth.uid() or admin). This
  // table is only ever written by bind_phone_identity() based on
  // Supabase Auth's own phone_confirmed_at, never a client claim.
  const fetchPhoneVerification = async (userId: string): Promise<PhoneVerification> => {
    const { data, error } = await supabase
      .from('phone_identities')
      .select('phone, verified_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.log(`VELORA_PHONE_IDENTITY_FETCH_ERROR: ${error.message}`);
      return { verified: false };
    }
    if (!data) return { verified: false };
    return { verified: true, phone: data.phone, verifiedAt: data.verified_at };
  };

  // Exposed so PhoneVerificationScreen/Profile can re-check on demand.
  const refreshPhoneVerificationStatus = async () => {
    if (!user) return;
    const phoneVerification = await fetchPhoneVerification(user.id);
    setUser((prev) => (prev ? { ...prev, phoneVerification } : prev));
  };

  // SUBSCRIPTION MONETIZATION -- has_active_subscription() is SECURITY
  // DEFINER specifically so this same call works for a signed-in owner here
  // AND for the signed-out public website (see 0026_owner_subscriptions.sql)
  // -- neither ever sees the underlying payment rows, only this one boolean.
  const fetchSubscriptionStatus = async (userId: string): Promise<{ active: boolean; expiresAt?: string }> => {
    const { data, error } = await supabase.rpc('has_active_subscription', { p_owner_id: userId });
    if (error) {
      console.log(`VELORA_SUBSCRIPTION_STATUS_FETCH_ERROR: ${error.message}`);
      return { active: false };
    }
    if (!data) return { active: false };
    // The most recent active row's expiry, for display only (e.g. "renews
    // in 12 days") -- has_active_subscription() already confirmed at least
    // one unexpired row exists; this is a best-effort read of the same
    // table via the caller's OWN RLS (owner reading their own rows), not a
    // second privileged call.
    const { data: latest } = await supabase
      .from('owner_subscriptions')
      .select('expires_at')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { active: true, expiresAt: latest?.expires_at };
  };

  // Exposed so SubscriptionScreen/Profile can re-check on demand (e.g.
  // right after a successful payment, before navigating away).
  const refreshSubscriptionStatus = async () => {
    if (!user) return;
    const subscription = await fetchSubscriptionStatus(user.id);
    setUser((prev) => (prev ? { ...prev, subscriptionActive: subscription.active, subscriptionExpiresAt: subscription.expiresAt } : prev));
  };

  // The two Edge Functions from supabase/functions/ -- see their own
  // top-of-file comments for the full create-order -> Razorpay Checkout ->
  // verify-payment flow this pair implements. AuthContext only ever
  // forwards the call and its result; it never touches a Razorpay key or
  // signature itself.
  const createSubscriptionOrder = async (): Promise<
    { success: true; orderId: string; amount: number; currency: string; keyId: string } | { success: false; error: string }
  > => {
    const { data, error } = await supabase.functions.invoke('create-subscription-order');
    if (error) {
      console.log(`VELORA_CREATE_SUBSCRIPTION_ORDER_ERROR: ${error.message}`);
      return { success: false, error: "Couldn't start the payment. Please try again." };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }
    return { success: true, orderId: data.orderId, amount: data.amount, currency: data.currency, keyId: data.keyId };
  };

  const verifySubscriptionPayment = async (params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<AuthResult> => {
    const { data, error } = await supabase.functions.invoke('verify-subscription-payment', { body: params });
    if (error) {
      console.log(`VELORA_VERIFY_SUBSCRIPTION_PAYMENT_ERROR: ${error.message}`);
      return { success: false, error: "Payment could not be verified. Please contact support if you were charged." };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }
    await refreshSubscriptionStatus();
    return { success: true };
  };

  // Reads the caller's own row from public.owner_verifications (RLS:
  // user_id = auth.uid() or admin) and maps it to the app's OwnerVerification
  // shape. Never includes the raw ID number -- that column doesn't even
  // exist server-side (only a hash does), so there is nothing to leak here.
  const fetchOwnerVerification = async (userId: string): Promise<OwnerVerification> => {
    const { data, error } = await supabase
      .from('owner_verifications')
      .select('status, full_name, phone, id_type, submitted_at, reviewed_at, rejection_reason')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.log(`VELORA_OWNER_VERIFICATION_FETCH_ERROR: ${error.message}`);
      return { status: 'none' };
    }
    if (!data) return { status: 'none' };
    return {
      status: data.status as OwnerVerification['status'],
      fullName: data.full_name ?? undefined,
      phone: data.phone ?? undefined,
      idType: data.id_type ?? undefined,
      submittedAt: data.submitted_at ?? undefined,
      verifiedAt: data.status === 'verified' ? (data.reviewed_at ?? undefined) : undefined,
      rejectionReason: data.rejection_reason ?? undefined,
    };
  };

  // Exposed so OwnerVerificationScreen can re-check status on demand (e.g.
  // pull-to-refresh while a submission is pending) without a full app
  // restart -- there is no realtime subscription on this table.
  const refreshOwnerVerificationStatus = async () => {
    if (!user) return;
    const ownerVerification = await fetchOwnerVerification(user.id);
    setUser((prev) => (prev ? { ...prev, ownerVerification } : prev));
  };

  // MULTI-DEVICE MIGRATION -- "which phone/platform did this account log in
  // from" used to be information nobody but the device itself had. This
  // fires the log_user_session SECURITY DEFINER RPC (writes into the new
  // public.user_sessions table, readable only by that same user via RLS --
  // and by the project owner directly in Supabase's Table Editor, which
  // isn't subject to RLS) right after a real login/signup. It never prompts
  // for a new permission: `approxLocation` is only ever whatever this
  // device's on-device extras cache already has from the existing Location
  // flow (or omitted entirely if that's never been set). Fire-and-forget --
  // a failure here must never block or fail the actual sign-in/sign-up.
  const logUserSession = (event: 'login' | 'signup', userId: string) => {
    const approxLocation = profileExtrasRef.current[userId]?.location || null;
    supabase
      .rpc('log_user_session', {
        p_event: event,
        p_platform: Platform.OS,
        p_platform_version: String(Platform.Version),
        p_approx_location: approxLocation,
      })
      .then(({ error }) => {
        if (error) console.log(`VELORA_SESSION_LOG_ERROR: ${error.message}`);
      });
    // PERMISSIONS FEATURE -- shows the real native notification-permission
    // dialog and, if granted, saves this device's push token so booking/
    // message/report updates can actually reach the person. Fire-and-forget
    // for the same reason as the session log above: a permission dialog or
    // network hiccup here must never block or fail sign-in/sign-up.
    void registerForPushNotifications(userId);
  };

  // Persists exactly the fields with no confirmed `profiles` column (see
  // ProfileExtras above) so they survive a full app restart -- on-device
  // only, never sent to Supabase. Called from updateProfile/
  // submitOwnerVerification right after they update local state.
  const persistProfileExtras = async (userId: string, patch: ProfileExtras) => {
    const nextExtras = { ...profileExtrasRef.current, [userId]: { ...profileExtrasRef.current[userId], ...patch } };
    profileExtrasRef.current = nextExtras;
    await storage.setItem(AUTH_PROFILE_EXTRAS_KEY, JSON.stringify(nextExtras));
  };

  // Dedupes handleAuthDeepLink against a URL it already processed. Android
  // can deliver the SAME confirmation link both as Linking.getInitialURL()
  // AND as a follow-up 'url' event (both are wired up below), and calling
  // supabase.auth.setSession() a second time with the same already-applied
  // tokens is what produces the "SIGNED_OUT then callback then SIGNED_IN"
  // churn seen in the logs -- one real confirmation click should only ever
  // establish the session once. A ref (not state) so recording it never
  // itself triggers a render/effect.
  const lastHandledDeepLinkRef = useRef<string | null>(null);

  // Handles the `velora://auth-callback` link opened from a Supabase
  // confirmation email -- establishes the real session from the token(s) it
  // carries. onAuthStateChange (subscribed below) then picks up that
  // session the same way it would for a normal signInWithPassword() call,
  // so this never touches `user` state directly.
  const handleAuthDeepLink = async (url: string) => {
    if (!url || !url.startsWith(AUTH_CALLBACK_URL)) return;
    if (lastHandledDeepLinkRef.current === url) {
      console.log('VELORA_AUTH_CALLBACK_DUPLICATE_IGNORED');
      return;
    }
    lastHandledDeepLinkRef.current = url;
    // Never log the URL itself here -- it carries the access/refresh tokens
    // in the fragment/query string (see parseAuthCallbackParams below).
    console.log('VELORA_AUTH_CALLBACK_RECEIVED');
    const params = parseAuthCallbackParams(url);

    const errorDescription = params.get('error_description') || params.get('error');
    if (errorDescription) {
      console.log(`VELORA_AUTH_CALLBACK_ERROR: ${errorDescription}`);
      return;
    }

    // SECURITY FIX -- confirmed root cause of "reset-password link logs the
    // person straight into the app with their OLD password still active".
    // supabase-js's own 'PASSWORD_RECOVERY' auth event is only ever emitted
    // by ITS OWN automatic browser-URL session detection; calling
    // setSession()/exchangeCodeForSession() manually (required here since
    // React Native has no browser URL for it to auto-detect from) instead
    // fires the ordinary 'SIGNED_IN' event no matter which kind of
    // confirmation link this was. Both a signup-confirmation link and a
    // password-recovery link hit this exact same handler (both redirect to
    // AUTH_CALLBACK_URL -- see resetPassword/signup above), so without this
    // check there was no way to tell them apart: the recovery link
    // established a real session and onAuthStateChange's SIGNED_IN handling
    // took it straight past AppNavigation's `passwordRecoveryPending` gate
    // and into the authenticated app, never prompting for a new password.
    // Supabase includes `type=recovery` on a password-recovery link
    // specifically (not on signup/magic-link confirmations), which is
    // exactly the signal `passwordRecoveryPending` needs.
    const isRecovery = params.get('type') === 'recovery';

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        console.log(`VELORA_AUTH_CALLBACK_SET_SESSION_ERROR: ${error.message}`);
      } else if (isRecovery) {
        setPasswordRecoveryPending(true);
      }
      return;
    }

    const code = params.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.log(`VELORA_AUTH_CALLBACK_EXCHANGE_ERROR: ${error.message}`);
      } else if (isRecovery) {
        setPasswordRecoveryPending(true);
      }
    }
  };

  useEffect(() => {
    // Guards the two subscriptions below, which aren't created until the
    // on-device extras cache has loaded (see the comment on
    // profileExtrasRef) -- if this effect were torn down before that finishes
    // (e.g. fast remount), there'd be nothing yet to unsubscribe.
    let cancelled = false;
    let authSubscription: { unsubscribe: () => void } | undefined;
    let linkingSubscription: { remove: () => void } | undefined;

    (async () => {
      try {
        const raw = await storage.getItem(AUTH_PROFILE_EXTRAS_KEY);
        if (raw) profileExtrasRef.current = JSON.parse(raw);
      } catch {
        // Corrupted/unreadable cache -- proceed with none rather than block
        // session restore on it.
      }
      if (cancelled) return;

      // onAuthStateChange fires immediately on subscribe with the current
      // session (INITIAL_SESSION), which is what restores a signed-in user
      // on app launch -- no separate getSession() bootstrap call is needed.
      // Loading profileExtrasRef above FIRST means that very first restore
      // already has the on-device phone/bio/location/ownerVerification
      // fallback available, instead of racing it.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        console.log(`VELORA_AUTH_STATE_CHANGE event=${event} hasSession=${!!session}`);
        // Supabase emits this specific event (never SIGNED_IN) only when the
        // active session came from a password-recovery link -- see
        // passwordRecoveryPending's own comment on the context interface.
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryPending(true);
        }
        loadUserFromSession(session).finally(() => setIsLoading(false));
      });
      authSubscription = subscription;

      // Cold start: the app was completely closed and the OS launched it by
      // opening the confirmation link -- the link is then delivered as the
      // "initial URL" instead of a later 'url' event.
      Linking.getInitialURL()
        .then((url) => {
          if (url) handleAuthDeepLink(url);
        })
        .catch((err) => console.log(`VELORA_AUTH_CALLBACK_INITIAL_URL_ERROR: ${err}`));

      // Warm start: the app is already running (foreground or background)
      // when the confirmation link is opened.
      linkingSubscription = Linking.addEventListener('url', ({ url }) => {
        handleAuthDeepLink(url);
      });
    })();

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
      linkingSubscription?.remove();
    };
  }, []);

  // `role` is the mode picked on the Login screen. Unlike the old mock
  // auth, a non-existent account is no longer auto-created here -- it now
  // correctly fails with Supabase's own "Invalid login credentials" error.
  // An existing account can freely log back in as a Renter, but can only
  // be treated as an Owner if `profiles.role` already says so -- otherwise
  // it logs in as whatever role it already has, with `info` explaining why.
  const login = async (email: string, password: string, role?: UserRole): Promise<AuthResult> => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      return { success: false, error: 'Enter a valid email address.' };
    }
    if (!password) {
      return { success: false, error: 'Password cannot be empty.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) {
      console.log(`VELORA_AUTH_LOGIN_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    if (!data.session) {
      return { success: false, error: 'Could not sign in right now. Please try again.' };
    }

    let info: string | undefined;
    if (role) {
      const { data: profileResult } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();
      const actualRole = dbRoleToAppRole((profileResult as { role: string | null } | null)?.role);
      if (actualRole !== role) {
        info =
          actualRole === 'owner'
            ? 'This account is a verified car owner — logged in as Car Owner.'
            : "This account isn't a verified car owner yet — logged in as Customer. Apply from Profile > Become a Car Owner.";
      }
    }

    logUserSession('login', data.session.user.id);

    // onAuthStateChange (SIGNED_IN) drives the actual `user` state update.
    return { success: true, info };
  };

  const signup: AuthContextValue['signup'] = async ({ name, email, password, confirmPassword, role }) => {
    if (!name.trim()) return { success: false, error: 'Please enter your name.' };
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    if (password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };
    if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Consumed by the existing `handle_new_user()` trigger on
        // auth.users to populate profiles.full_name / avatar_url.
        data: {
          full_name: name.trim(),
          avatar_url: avatars.abhishek,
        },
        // Sends the confirmation email's link back to this app instead of
        // Supabase's localhost:3000 default. Requires this exact URL to also
        // be added to the project's Redirect URLs allow-list in the
        // Supabase dashboard (not done here -- see report).
        emailRedirectTo: AUTH_CALLBACK_URL,
      },
    });
    if (error) {
      console.log(`VELORA_AUTH_SIGNUP_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    if (!data.session) {
      // Email confirmation is required by the Supabase project settings --
      // no session is issued until the user confirms.
      //
      // PRODUCTION-AUDIT FIX -- the account WAS genuinely created; this used
      // to come back as `success: false` with this same sentence as the
      // `error`, which SignupScreen renders in its red error banner. A real
      // success rendered as a failure is exactly the "success looks like an
      // error" bug reported against this screen -- the only thing left to
      // do is tell the person to go check their email, not report a
      // failure. `success: true` + `info` is the same pattern this file
      // already uses elsewhere (see switchRole) for "succeeded, here's a
      // heads-up" -- SignupScreen shows `info` in a neutral/positive banner
      // instead of the error one.
      return { success: true, info: 'Account created! Check your email to confirm it, then log in.' };
    }

    logUserSession('signup', data.session.user.id);

    // SECURITY FIX -- this used to write role='owner' directly here with
    // zero verification the moment someone picked "I'm an owner" at
    // signup, which was a straight bypass of switchRole's isVerifiedOwner
    // gate (itself now backed by the real owner_verifications table -- see
    // submitOwnerVerification). Every account now starts as a renter
    // regardless of what they picked here; becoming an owner only ever
    // happens through switchRole('owner'), which requires real,
    // admin-approved verification first. SignupScreen still has the
    // `role` it passed in and is responsible for routing someone who
    // picked "owner" into the verification flow next -- this function no
    // longer needs to signal that back.
    return { success: true, userId: data.session.user.id };
  };

  const logout = async () => {
    // AUDIT FIX -- registerForPushNotifications saves this device's Expo
    // push token keyed by user_id (see push_tokens), but nothing ever
    // cleared it on logout. Left as-is, a signed-out device kept receiving
    // that account's real push notifications indefinitely (bookings,
    // messages -- anything notify() fires) and, if tapped, tried to deep
    // link into an authenticated-only screen the (now logged-out) app
    // isn't even rendering. Blanking the token here -- using the update
    // grant push_tokens already has, no RLS/schema change needed -- makes
    // the send-push Edge Function's own `if (!tokenRow?.token) skip` treat
    // this device as unregistered until the next login re-saves a real
    // token. Must run BEFORE signOut() -- auth.uid() (which the RLS check
    // relies on) stops resolving to this user the moment the session ends.
    if (user) {
      const { error } = await supabase.from('push_tokens').update({ token: '' }).eq('user_id', user.id);
      if (error) console.log(`VELORA_PUSH_TOKEN_CLEAR_ERROR: ${error.message}`);
    }
    await supabase.auth.signOut();
    setPasswordRecoveryPending(false);
    // onAuthStateChange (SIGNED_OUT) clears `user` state.
  };

  // ACCOUNT DELETION FIX -- see deactivate_own_account() / 0023_account_
  // deletion.sql. Marks the account deleted server-side FIRST (so it can no
  // longer be logged into again -- loadUserFromSession's deleted_at check
  // above is what actually enforces that on every future session), then
  // signs this device out same as a normal logout.
  const deactivateAccount = async (): Promise<AuthResult> => {
    if (!user) return { success: false, error: 'Not signed in.' };
    const { data, error } = await supabase.rpc('deactivate_own_account');
    if (error) {
      console.log(`VELORA_AUTH_DEACTIVATE_ERROR: ${error.message}`);
      return { success: false, error: "Couldn't delete your account right now. Please try again." };
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      return { success: false, error: result.error ?? "Couldn't delete your account right now." };
    }
    await logout();
    return { success: true };
  };

  const updateProfile = async (patch: Partial<AppUser>): Promise<boolean> => {
    if (!user) return false;
    const nextUser = { ...user, ...patch };
    setUser(nextUser);
    profileCacheRef.current.set(nextUser.id, nextUser);

    // Only name/avatar have a confirmed backing column in `profiles`.
    // Everything else in AppUser (phone, bio, location, ownerVerification
    // detail) has no confirmed column, so it's mirrored into the on-device
    // extras cache instead (see AUTH_PROFILE_EXTRAS_KEY) -- this is what
    // keeps it from resetting to blank on the next full app restart.
    if (
      patch.phone !== undefined ||
      patch.bio !== undefined ||
      patch.location !== undefined ||
      patch.locationSource !== undefined ||
      patch.preferredPaymentMethod !== undefined
    ) {
      await persistProfileExtras(nextUser.id, {
        phone: nextUser.phone,
        bio: nextUser.bio,
        location: nextUser.location,
        locationSource: nextUser.locationSource,
        preferredPaymentMethod: nextUser.preferredPaymentMethod,
      });
    }

    const dbPatch: Record<string, string> = {};
    if (patch.name !== undefined) dbPatch.full_name = patch.name;
    if (patch.avatar !== undefined) dbPatch.avatar_url = patch.avatar;
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from('profiles').update(dbPatch).eq('id', user.id);
      if (error) {
        console.log(`VELORA_AUTH_PROFILE_UPDATE_ERROR: ${error.message}`);
        // Silent-success fix -- this used to only log and return, so a
        // failed name/avatar write (e.g. a network hiccup) still left the
        // local optimistic `setUser` above in place, making EditProfileScreen
        // show "Profile updated" even though nothing persisted and every
        // OTHER device would never see the change. Reporting false lets the
        // caller tell the person honestly instead.
        return false;
      }
    }
    return true;
  };

  // Renter -> Owner requires prior verification; Owner -> Renter is always allowed.
  const switchRole = async (role: UserRole): Promise<AuthResult> => {
    if (!user) return { success: false, error: 'Not signed in.' };
    // Idempotent no-op -- switching to the role that's already active must
    // not hit Supabase or create a new `user` object. Without this, any
    // repeated call with the same role (a fast double-tap on the switch
    // button, or anything downstream that re-runs off `user`'s reference
    // changing) keeps producing a brand-new `user`/context value every
    // time for no actual change, which is exactly the kind of needless
    // state churn that can spiral into a setState/useEffect update loop in
    // whatever reacts to it.
    if (user.role === role) return { success: true };
    if (role === 'owner' && !isVerifiedOwner(user)) {
      return { success: false, error: 'Complete Owner Verification from Profile before switching to Car Owner Mode.' };
    }
    const { error } = await supabase.from('profiles').update({ role: appRoleToDbRole(role) }).eq('id', user.id);
    if (error) {
      console.log(`VELORA_AUTH_SWITCH_ROLE_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    setUser((prev) => (prev ? { ...prev, role } : prev));
    return { success: true };
  };

  const resetPassword = async (email: string): Promise<AuthResult> => {
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: AUTH_CALLBACK_URL,
    });
    if (error) {
      console.log(`VELORA_AUTH_RESET_PASSWORD_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  // SECURITY FIX -- the missing half of the reset flow (see
  // passwordRecoveryPending's comment above). Requires the active session
  // to already be the one Supabase issued from the recovery link, which is
  // exactly the state SetNewPasswordScreen only renders in.
  const updatePassword = async (newPassword: string): Promise<AuthResult> => {
    if (newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.log(`VELORA_AUTH_UPDATE_PASSWORD_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    setPasswordRecoveryPending(false);
    return { success: true };
  };

  // PHONE/OTP LOGIN -- sends the SMS. Supabase creates the auth.users row
  // on first OTP request for a brand-new phone number (same as it does for
  // email signup), so this single call covers both "new phone, first
  // login" and "returning phone" -- there is no separate signup step.
  const sendPhoneOtp = async (phone: string): Promise<AuthResult> => {
    const e164 = toE164IndianPhone(phone);
    if (!e164) {
      return { success: false, error: 'Enter a valid 10-digit mobile number.' };
    }
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) {
      console.log(`VELORA_AUTH_SEND_PHONE_OTP_ERROR: ${error.message}`);
      // Supabase/Twilio's own error text is already accurate and
      // actionable here (e.g. rate-limit messages) -- surfaced as-is
      // rather than replaced with a generic failure.
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  // PHONE/OTP LOGIN -- verifies the code. On success, Supabase's client
  // establishes a real session internally; this function deliberately does
  // NOT call setUser() itself -- onAuthStateChange (subscribed once, in the
  // effect above) fires SIGNED_IN and runs loadUserFromSession exactly like
  // it does for signInWithPassword, so there is exactly one code path that
  // ever turns a Supabase session into `user` state.
  const verifyPhoneOtp = async (phone: string, otp: string): Promise<AuthResult> => {
    const e164 = toE164IndianPhone(phone);
    if (!e164) {
      return { success: false, error: 'Enter a valid 10-digit mobile number.' };
    }
    if (!isValidOtp(otp)) {
      return { success: false, error: 'Enter the 6-digit code sent to your phone.' };
    }
    const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token: otp.trim(), type: 'sms' });
    if (error) {
      console.log(`VELORA_AUTH_VERIFY_PHONE_OTP_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    if (data.session?.user.id) {
      logUserSession('login', data.session.user.id);
    }
    // PHONE IDENTITY BINDING -- a phone-login also just confirmed this
    // exact phone on auth.users (Supabase sets phone_confirmed_at for any
    // successful verifyOtp, regardless of which flow triggered it), so
    // record it in phone_identities the same way the bind flow below does.
    // Awaited (not fire-and-forget) so the explicit state patch after it
    // always reflects the true end result, regardless of whether the
    // concurrent onAuthStateChange -> loadUserFromSession happened to run
    // its own phone_identities read before or after this insert commits.
    const bindResult = await supabase.rpc('bind_phone_identity');
    if (bindResult.error) {
      console.log(`VELORA_BIND_PHONE_IDENTITY_ERROR: ${bindResult.error.message}`);
    } else if (bindResult.data?.success) {
      setUser((prev) =>
        prev ? { ...prev, phoneVerification: { verified: true, phone: e164, verifiedAt: new Date().toISOString() } } : prev,
      );
    }
    return { success: true };
  };

  // PHONE IDENTITY BINDING -- for an ALREADY authenticated email/Google
  // session that wants to bind/verify a phone onto the SAME account (not
  // sign into a different one). Uses Supabase Auth's own phone-change flow
  // (updateUser + verifyOtp type:'phone_change'), which is what actually
  // sets auth.users.phone/phone_confirmed_at for the CURRENT user -- this
  // is a different Supabase API from sendPhoneOtp/verifyPhoneOtp above
  // (phone-based sign-IN), reused here for phone-based identity BINDING.
  const sendPhoneBindOtp = async (phone: string): Promise<AuthResult> => {
    if (!user) return { success: false, error: 'Not signed in.' };
    const e164 = toE164IndianPhone(phone);
    if (!e164) {
      return { success: false, error: 'Enter a valid 10-digit mobile number.' };
    }
    const { error } = await supabase.auth.updateUser({ phone: e164 });
    if (error) {
      console.log(`VELORA_SEND_PHONE_BIND_OTP_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const verifyPhoneBindOtp = async (phone: string, otp: string): Promise<AuthResult> => {
    if (!user) return { success: false, error: 'Not signed in.' };
    const e164 = toE164IndianPhone(phone);
    if (!e164) {
      return { success: false, error: 'Enter a valid 10-digit mobile number.' };
    }
    if (!isValidOtp(otp)) {
      return { success: false, error: 'Enter the 6-digit code sent to your phone.' };
    }
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp.trim(), type: 'phone_change' });
    if (error) {
      console.log(`VELORA_VERIFY_PHONE_BIND_OTP_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }

    // Confirmed by Supabase Auth at this point (auth.users.phone_confirmed_at
    // is now set for THIS user) -- bind_phone_identity() reads that directly
    // (never trusts e164 here) and is where the real duplicate-phone
    // rejection happens, via phone_identities' unique constraint.
    const { data, error: bindError } = await supabase.rpc('bind_phone_identity');
    if (bindError) {
      console.log(`VELORA_BIND_PHONE_IDENTITY_ERROR: ${bindError.message}`);
      return { success: false, error: bindError.message };
    }
    if (!data?.success) {
      return { success: false, error: data?.error ?? "Couldn't verify this phone number. Please try again." };
    }

    setUser((prev) =>
      prev ? { ...prev, phoneVerification: { verified: true, phone: e164, verifiedAt: new Date().toISOString() } } : prev,
    );
    return { success: true };
  };

  const resendVerificationEmail = async (email: string): Promise<AuthResult> => {
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    if (error) {
      console.log(`VELORA_AUTH_RESEND_VERIFICATION_ERROR: ${error.message}`);
      // Supabase's resend endpoint is itself rate-limited server-side (a
      // real, expected outcome if the person taps Resend quickly) -- surface
      // that message as-is rather than a generic failure, since it's already
      // an accurate, actionable sentence ("For security purposes, you can
      // only request this after N seconds.").
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  // SECURITY FIX -- real, server-side submission via submit_owner_verification
  // (0020_owner_verifications.sql). No longer flips role='owner' here at
  // all -- an admin must approve the submission first (status -> 'verified'
  // in the database); only then does switchRole('owner') below allow
  // entering Owner Mode. The raw ID number is sent once, over TLS, as an
  // RPC parameter -- it is never stored client-side (not in state, not in
  // AsyncStorage) and the server itself only ever persists a hash of it.
  const submitOwnerVerification = async (input: OwnerVerificationInput): Promise<AuthResult> => {
    if (!user) return { success: false, error: 'Not signed in.' };
    if (isVerifiedOwner(user)) return { success: false, error: 'This account is already verified.' };

    const { data, error } = await supabase.rpc('submit_owner_verification', {
      p_full_name: input.fullName,
      p_phone: input.phone,
      p_id_type: input.idType,
      p_id_number: input.idNumber,
      p_id_document_path: input.idDocumentPath,
    });
    if (error) {
      console.log(`VELORA_AUTH_OWNER_VERIFICATION_ERROR: ${error.message}`);
      return { success: false, error: error.message };
    }
    if (!data?.success) {
      return { success: false, error: data?.error ?? "Couldn't submit verification. Please try again." };
    }

    const ownerVerification = await fetchOwnerVerification(user.id);
    setUser((prev) => (prev ? { ...prev, ownerVerification } : prev));
    return { success: true };
  };

  // Synchronous, cache-only lookup -- resolves the signed-in user's own
  // profile (profileCacheRef) or an already-fetched public profile
  // (publicProfileCacheRef, populated by fetchPublicProfile below). Never
  // triggers a network call itself, so it stays safe to call directly from
  // render.
  const getUserById = (id: string): AppUser | undefined =>
    profileCacheRef.current.get(id) ?? publicProfileCacheRef.current.get(id);

  // Final non-payment hardening -- TARGET 1. `profiles_select_own` (id =
  // auth.uid() only) correctly blocks a direct `.from('profiles').select()`
  // for anyone but yourself, which is why OwnerPublicProfileScreen,
  // CustomerProfileScreen, and CarDetails' "Listed by" row could never
  // resolve another user before this. Rather than weaken that policy (not
  // allowed, and not needed), this goes through the get_public_profile
  // SECURITY DEFINER RPC, which returns ONLY id/full_name/avatar_url for the
  // requested id -- never phone, email, role, or any owner-verification
  // detail (none of that is even readable server-side for another user;
  // verification detail specifically only ever lives in this device's own
  // authProfileExtras cache, so it can never be honestly shown for someone
  // else -- see the 'none' default below).
  const fetchPublicProfile = async (id: string): Promise<AppUser | undefined> => {
    const cached = getUserById(id);
    if (cached) return cached;

    const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: id }).maybeSingle();
    if (error) {
      console.log(`VELORA_AUTH_PUBLIC_PROFILE_ERROR id=${id} message=${error.message}`);
      return undefined;
    }
    const row = data as { id: string; full_name: string | null; avatar_url: string | null } | null;
    if (!row) return undefined;

    const publicProfile: AppUser = {
      id: row.id,
      name: row.full_name || 'VELORA User',
      email: '',
      role: 'renter',
      avatar: row.avatar_url || avatars.abhishek,
      location: '',
      // Deliberately omitted, not fabricated -- bio/createdAt/verification
      // detail have no public-safe server-side source (see the comment
      // above); every consumer screen already renders these as optional
      // ("Not added yet", hidden row, etc.), so leaving them unset is the
      // honest, already-supported result rather than a broken one.
      ownerVerification: { status: 'none' },
    };
    publicProfileCacheRef.current.set(id, publicProfile);
    return publicProfile;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      deactivateAccount,
      refreshSubscriptionStatus,
      createSubscriptionOrder,
      verifySubscriptionPayment,
      updateProfile,
      switchRole,
      resetPassword,
      passwordRecoveryPending,
      updatePassword,
      sendPhoneOtp,
      verifyPhoneOtp,
      sendPhoneBindOtp,
      verifyPhoneBindOtp,
      refreshPhoneVerificationStatus,
      resendVerificationEmail,
      submitOwnerVerification,
      refreshOwnerVerificationStatus,
      getUserById,
      fetchPublicProfile,
    }),
    [user, isLoading, passwordRecoveryPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
