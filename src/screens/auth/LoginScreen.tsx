import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { heroImages } from '../../data/images';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { EmailVerificationModal } from '../../components/EmailVerificationModal';
import { UserRole } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const RESEND_COOLDOWN_SECONDS = 30;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { login, resendVerificationEmail, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('renter');
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  // PRODUCT IMPROVEMENT -- Supabase's own login error for this exact account
  // state is literally "Email not confirmed", which used to just render as a
  // raw red error banner -- accurate, but a dead end with no way forward.
  // Routes to the same EmailVerificationModal used at signup instead, so
  // this is a recoverable moment (open mail / resend) rather than a wall.
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // PHONE/OTP LOGIN -- a separate method toggle, not a replacement. Email
  // fields/state/onLogin above are completely untouched by any of this.
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startResendCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onLogin = async () => {
    setError(undefined);
    setInfo(undefined);
    setLoading(true);
    const result = await login(email, password, role);
    setLoading(false);
    if (!result.success) {
      if (result.error && /email not confirmed/i.test(result.error)) {
        setShowVerificationModal(true);
      } else {
        setError(result.error);
      }
    } else if (result.info) {
      setInfo(result.info);
    }
  };

  const onSendOtp = async () => {
    if (phoneLoading) return; // duplicate-tap guard while a request is in flight
    setPhoneError(undefined);
    setPhoneLoading(true);
    const result = await sendPhoneOtp(phone);
    setPhoneLoading(false);
    if (!result.success) {
      setPhoneError(result.error);
      return;
    }
    setOtpSent(true);
    startResendCooldown();
  };

  const onResendOtp = async () => {
    if (resendCooldown > 0 || phoneLoading) return;
    await onSendOtp();
  };

  const onVerifyOtp = async () => {
    if (otpLoading) return;
    setPhoneError(undefined);
    setOtpLoading(true);
    const result = await verifyPhoneOtp(phone, otp);
    setOtpLoading(false);
    if (!result.success) {
      setPhoneError(result.error);
    }
    // On success, onAuthStateChange/loadUserFromSession takes it from here --
    // AppNavigation swaps to the authenticated stack on its own.
  };

  const onChangePhoneNumber = () => {
    setOtpSent(false);
    setOtp('');
    setPhoneError(undefined);
    setResendCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image source={{ uri: heroImages.authHero }} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroOverlay, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={styles.brand}>VELORA</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.segmentRow}>
            <View style={[styles.segment, styles.segmentActive]}>
              <Text style={styles.segmentTextActive}>Login</Text>
            </View>
            <Pressable style={styles.segment} onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.segmentText}>Sign Up</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Login to keep booking the world's best cars.</Text>

          <Text style={styles.label}>Continue as</Text>
          <View style={styles.roleRow}>
            <Pressable
              style={[styles.roleCard, role === 'renter' ? styles.roleCardActive : undefined]}
              onPress={() => setRole('renter')}
              accessibilityLabel="Continue as a renter"
            >
              <Ionicons name="car-sport-outline" size={22} color={role === 'renter' ? colors.onPrimary : colors.textPrimary} />
              <Text style={[styles.roleTitle, role === 'renter' ? styles.roleTitleActive : undefined]}>Rent Cars</Text>
              <Text style={[styles.roleSubtitle, role === 'renter' ? styles.roleSubtitleActive : undefined]}>Browse & book</Text>
            </Pressable>
            <Pressable
              style={[styles.roleCard, role === 'owner' ? styles.roleCardActive : undefined]}
              onPress={() => setRole('owner')}
              accessibilityLabel="Continue as a rental owner"
            >
              <Ionicons name="key-outline" size={22} color={role === 'owner' ? colors.onPrimary : colors.textPrimary} />
              <Text style={[styles.roleTitle, role === 'owner' ? styles.roleTitleActive : undefined]}>List My Car</Text>
              <Text style={[styles.roleSubtitle, role === 'owner' ? styles.roleSubtitleActive : undefined]}>Earn as an owner</Text>
            </Pressable>
          </View>

          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodTab, loginMethod === 'email' ? styles.methodTabActive : undefined]}
              onPress={() => setLoginMethod('email')}
              accessibilityLabel="Login with email"
            >
              <Text style={[styles.methodTabText, loginMethod === 'email' ? styles.methodTabTextActive : undefined]}>Email</Text>
            </Pressable>
            <Pressable
              style={[styles.methodTab, loginMethod === 'phone' ? styles.methodTabActive : undefined]}
              onPress={() => setLoginMethod('phone')}
              accessibilityLabel="Login with phone"
            >
              <Text style={[styles.methodTabText, loginMethod === 'phone' ? styles.methodTabTextActive : undefined]}>Phone</Text>
            </Pressable>
          </View>

          {loginMethod === 'email' ? (
            <>
              <InputField
                label="Email Address"
                placeholder="you@example.com"
                leftIcon="mail-outline"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <InputField
                label="Password"
                placeholder="••••••••••••"
                leftIcon="lock-closed-outline"
                isPassword
                value={password}
                onChangeText={setPassword}
              />

              {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
              {info ? <Text style={styles.infoBanner}>{info}</Text> : null}

              <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}>
                <Text style={styles.forgot}>Forgot Password</Text>
              </Pressable>

              <PrimaryButton label={role === 'owner' ? 'Login as Owner' : 'Login'} onPress={onLogin} loading={loading} />
            </>
          ) : (
            <>
              {!otpSent ? (
                <>
                  <InputField
                    label="Mobile Number (+91)"
                    placeholder="+91 98765 43210"
                    leftIcon="call-outline"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  {phoneError ? <Text style={styles.errorBanner}>{phoneError}</Text> : null}
                  <PrimaryButton
                    label={phoneLoading ? 'Sending…' : 'Send OTP'}
                    onPress={onSendOtp}
                    loading={phoneLoading}
                    disabled={phoneLoading}
                    style={{ marginTop: spacing.sm }}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.otpSentNote}>Code sent to +91 {phone.trim()}. </Text>
                  <InputField
                    label="6-Digit Code"
                    placeholder="123456"
                    leftIcon="keypad-outline"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                  />
                  {phoneError ? <Text style={styles.errorBanner}>{phoneError}</Text> : null}
                  <View style={styles.otpActionsRow}>
                    <Pressable onPress={onChangePhoneNumber} hitSlop={8}>
                      <Text style={styles.forgot}>Change Number</Text>
                    </Pressable>
                    <Pressable onPress={onResendOtp} disabled={resendCooldown > 0 || phoneLoading} hitSlop={8}>
                      <Text style={[styles.forgot, resendCooldown > 0 ? styles.forgotDisabled : undefined]}>
                        {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : phoneLoading ? 'Resending…' : 'Resend OTP'}
                      </Text>
                    </Pressable>
                  </View>
                  <PrimaryButton
                    label={otpLoading ? 'Verifying…' : 'Verify & Login'}
                    onPress={onVerifyOtp}
                    loading={otpLoading}
                    disabled={otpLoading}
                    style={{ marginTop: spacing.md }}
                  />
                </>
              )}
            </>
          )}

          {/* Real, working Google/Apple sign-in needs an OAuth app registered
              in Google Cloud / Apple Developer consoles and wired into
              Supabase's Auth providers -- external developer-account setup
              this session can't create, the same category as the payment
              gateway and government KYC. A button that quietly logged in
              with blank credentials (the previous behavior here) was worse
              than not having it, so it's left out rather than faked. */}
        </View>
      </ScrollView>

      <EmailVerificationModal
        visible={showVerificationModal}
        email={email.trim()}
        onResend={resendVerificationEmail}
        onClose={() => setShowVerificationModal(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  hero: { height: 280, backgroundColor: colors.black },
  heroOverlay: { flex: 1, paddingHorizontal: spacing.lg },
  brand: { ...typography.headingMd, color: colors.white },
  panel: {
    marginTop: -32,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segment: { flex: 1, paddingVertical: 12, borderRadius: radii.pill, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.onPrimary },
  segmentText: { ...typography.titleMd, color: colors.textSecondary },
  segmentTextActive: { ...typography.titleMd, color: colors.white },
  title: { ...typography.displayMd, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  roleRow: { flexDirection: 'row', marginBottom: spacing.lg },
  roleCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginRight: spacing.sm,
  },
  roleCardActive: { backgroundColor: colors.onPrimary, borderColor: colors.onPrimary },
  roleTitle: { ...typography.titleMd, color: colors.textPrimary, marginTop: 8 },
  roleTitleActive: { color: colors.white },
  roleSubtitle: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  roleSubtitleActive: { color: 'rgba(255,255,255,0.7)' },
  errorBanner: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
  infoBanner: { ...typography.bodySm, color: colors.info, marginBottom: spacing.sm },
  forgot: { ...typography.titleMd, color: colors.textPrimary },
  forgotDisabled: { color: colors.textTertiary },
  methodRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: spacing.lg,
  },
  methodTab: { flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: 'center' },
  methodTabActive: { backgroundColor: colors.white },
  methodTabText: { ...typography.bodyMd, color: colors.textSecondary },
  methodTabTextActive: { ...typography.bodyMd, color: colors.textPrimary, fontWeight: '700' },
  otpSentNote: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
  otpActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
});
