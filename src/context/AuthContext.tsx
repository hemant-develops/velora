import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppUser, OwnerVerification, UserRole } from '../types';
import { avatars } from '../data/images';
import { isValidEmail } from '../utils/format';
import { storage } from '../utils/storage';
import { registerForPushNotifications } from '../utils/pushNotifications';

// Final-verification fix -- phone/bio/location/locationSource/
// ownerVerification detail have no confirmed backing column in `profiles`
// (see the comment on loadUserFromSession below), so they only ever lived in
// React state. That meant they silently reset to blank on every full app
// restart (not just a background/foreground cycle) -- in particular, this
// quietly broke M9's "Near Me" quick filter on every cold start, since it
// depends entirely on `user.location` being set. Persisting them here, on
// device only (never sent to Supabase), keeps them intact across restarts
// without requiring a schema change.
const AUTH_PROFILE_EXTRAS_KEY = 'velora.authProfileExtras.v1';

interface ProfileExtras {
  phone?: string;
  bio?: string;
  location?: string;
  locationSource?: 'gps' | 'manual';
  ownerVerification?: OwnerVerification;
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
  // PRODUCT IMPROVEMENT -- backs the new EmailVerificationModal's "Resend"
  // action. Uses Supabase Auth's own built-in resend endpoint (the same
  // rate-limited, server-managed flow as the original confirmation email) --
  // no new schema, RPC, or RLS needed, and the same `emailRedirectTo` as
  // signup so a resent link lands back in this app identically.
  resendVerificationEmail: (email: string) => Promise<AuthResult>;
  submitOwnerVerification: (input: OwnerVerificationInput) => Promise<void>;
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
      .select('id, full_name, avatar_url, role')
      .eq('id', authUser.id)
      .maybeSingle();
    const profile = data as ProfileRow | null;

    if (error) {
      console.log(`VELORA_AUTH_PROFILE_LOAD_ERROR: ${error.message}`);
    }

    const extras = profileExtrasRef.current[authUser.id];

    setUser((prev) => {
      const base = prev && prev.id === authUser.id ? prev : undefined;
      const role = dbRoleToAppRole(profile?.role);
      // Role-switch bug fix -- owner verification is a fact about the
      // PERSON, not about which role happens to be active right now. This
      // used to be rebuilt as `{ status: 'none' }` any time `role` wasn't
      // 'owner', which silently discarded a genuinely completed
      // verification (both the in-memory value AND the persisted extras
      // fallback) the moment the account was viewed as a Renter -- e.g. on
      // a TOKEN_REFRESHED tick, or a full restart while in Renter mode.
      // switchRole('owner') later reads exactly this field to decide
      // whether to demand verification again, so that wipe is what made
      // Owner <-> Renter switching re-ask for verification. Computed here
      // independently of `role` so it survives any number of switches in
      // either direction: `base` (this session's own state) wins when it
      // already shows verified, the on-device extras cache is the fallback
      // (survives a restart), and only a genuinely never-verified account
      // falls through to 'none'.
      const knownVerification: OwnerVerification =
        base?.ownerVerification?.status === 'verified'
          ? base.ownerVerification
          : extras?.ownerVerification?.status === 'verified'
            ? extras.ownerVerification
            : { status: 'none' };
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
        avatar: profile?.avatar_url || base?.avatar || avatars.abhishek,
        role,
        ownerVerification:
          role === 'owner' && knownVerification.status !== 'verified'
            // profiles.role already says 'owner' (e.g. picked "List My Car"
            // at signup) but this device has no verification record for
            // them yet -- treat as instantly verified, same fallback as
            // before, rather than sending an already-owner account through
            // the verification form.
            ? { status: 'verified', verifiedAt: new Date().toISOString() }
            : knownVerification,
      };
      profileCacheRef.current.set(nextUser.id, nextUser);
      return nextUser;
    });
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

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) {
        console.log(`VELORA_AUTH_CALLBACK_SET_SESSION_ERROR: ${error.message}`);
      }
      return;
    }

    const code = params.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.log(`VELORA_AUTH_CALLBACK_EXCHANGE_ERROR: ${error.message}`);
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
            ? 'This account is a verified rental owner — logged in as Owner.'
            : "This account isn't a verified rental owner yet — logged in as Renter. Apply from Profile > Become a Rental Owner.";
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

    if (role === 'owner') {
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: appRoleToDbRole('owner') })
        .eq('id', data.session.user.id);
      if (roleError) {
        console.log(`VELORA_AUTH_SIGNUP_ROLE_ERROR: ${roleError.message}`);
      }
    }

    logUserSession('signup', data.session.user.id);

    // onAuthStateChange (SIGNED_IN) drives the actual `user` state update.
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
      patch.locationSource !== undefined
    ) {
      await persistProfileExtras(nextUser.id, {
        phone: nextUser.phone,
        bio: nextUser.bio,
        location: nextUser.location,
        locationSource: nextUser.locationSource,
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
      return { success: false, error: 'Complete Owner Verification from Profile before switching to Owner Mode.' };
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

  // Demo verification: instantly "approved" (a real build would call an
  // actual KYC/ID-verification provider here). Verifying also switches the
  // account into Owner Mode right away, since that's the whole point. Only
  // `role` is durably persisted to Supabase -- the verification detail
  // fields (fullName/phone/idType/idNumber, verifiedAt) have no confirmed
  // column, so they're mirrored into the on-device extras cache instead
  // (see AUTH_PROFILE_EXTRAS_KEY) so a completed verification survives a
  // full app restart instead of quietly reverting to a freshly-stamped,
  // detail-less "verified" record.
  const submitOwnerVerification = async (input: OwnerVerificationInput) => {
    if (!user) return;
    // Idempotent guard, mirroring switchRole's -- an already-verified
    // account re-reaching this (it shouldn't, now that loadUserFromSession
    // no longer wipes verification on a role switch, but this stays as a
    // defensive backstop) must not overwrite its saved verification record
    // or perform a redundant round trip.
    if (isVerifiedOwner(user)) return;
    const ownerVerification: OwnerVerification = { status: 'verified', ...input, verifiedAt: new Date().toISOString() };
    const nextUser: AppUser = { ...user, ownerVerification, role: 'owner' };
    setUser(nextUser);
    profileCacheRef.current.set(nextUser.id, nextUser);
    await persistProfileExtras(nextUser.id, { ownerVerification });

    const { error } = await supabase.from('profiles').update({ role: appRoleToDbRole('owner') }).eq('id', user.id);
    if (error) {
      console.log(`VELORA_AUTH_OWNER_VERIFICATION_ERROR: ${error.message}`);
    }
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
      updateProfile,
      switchRole,
      resetPassword,
      passwordRecoveryPending,
      updatePassword,
      resendVerificationEmail,
      submitOwnerVerification,
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
