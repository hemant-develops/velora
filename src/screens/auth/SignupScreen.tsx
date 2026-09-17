import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { heroImages } from '../../data/images';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { useRewards } from '../../context/RewardsContext';
import { EmailVerificationModal } from '../../components/EmailVerificationModal';
import { UserRole } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { signup, resendVerificationEmail } = useAuth();
  const { redeemReferralCode } = useRewards();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('renter');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  // PRODUCTION-AUDIT FIX -- a successful signup that needs email
  // confirmation used to come back from AuthContext as `success: false`
  // with an "error" that was actually good news ("Account created. Please
  // check your email..."), which this screen then rendered in the same red
  // error banner as a real failure -- a genuine success looking exactly
  // like a broken signup. AuthContext now reports that case as
  // `success: true` + `info`.
  //
  // PRODUCT IMPROVEMENT -- that `info` used to render as one line of plain
  // text, easy to miss and inconsistent with how VELORA treats every other
  // important system moment. It now opens EmailVerificationModal instead: a
  // focused, on-brand popup with the actual email address, an "Open Mail
  // App" action, and a real resend flow -- see that component for details.
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [referralNote, setReferralNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    setError(undefined);
    setLoading(true);
    const result = await signup({ name, email, password, confirmPassword, role });
    // Real referral redemption -- only runs once signup actually issued a
    // session (result.userId set), and never blocks the account from being
    // created: an invalid/blank code just skips silently rather than
    // failing the signup itself, since the referral bonus is a bonus, not
    // a requirement.
    if (result.success && result.userId && referralCode.trim()) {
      const redeemResult = await redeemReferralCode(referralCode, result.userId, name.trim() || 'New user');
      if (!redeemResult.success) setReferralNote(redeemResult.error);
    }
    setLoading(false);
    if (!result.success) {
      setError(result.error);
    } else if (result.info) {
      // Success, but no session yet (email confirmation pending) -- surface
      // the verification modal instead of silently doing nothing, which
      // would look like the button didn't work.
      setShowVerificationModal(true);
    } else if (role === 'owner') {
      // SECURITY FIX -- signup() no longer grants role='owner' directly
      // (see its own comment) -- a session was issued and this person
      // picked "I'm an owner" here. This screen is about to unmount as
      // AppNavigation swaps AuthNavigator for RootNavigator (driven by
      // the auth-state listener, not this callback), so imperatively
      // navigating to a RootNavigator-only screen from here isn't
      // reliable -- an Alert pointing at the existing, already-working
      // Profile > Become a Rental Owner entry point is.
      Alert.alert(
        'One more step',
        "You're signed in as a renter for now. Complete Owner Verification from Profile to start listing cars.",
      );
    }
    // A success with neither `error` nor `info`, for someone who picked
    // "renter", means a session WAS issued immediately -- nothing to show
    // here, the auth-state listener already takes the person into the app.
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
            <Pressable style={styles.segment} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.segmentText}>Login</Text>
            </Pressable>
            <View style={[styles.segment, styles.segmentActive]}>
              <Text style={styles.segmentTextActive}>Sign Up</Text>
            </View>
          </View>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join VELORA to rent — or list — premium cars.</Text>

          <InputField label="Full Name" placeholder="John Doe" leftIcon="person-outline" value={name} onChangeText={setName} />
          <InputField
            label="Email Address"
            placeholder="you@example.com"
            leftIcon="mail-outline"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <InputField label="Password" placeholder="••••••••••••" leftIcon="lock-closed-outline" isPassword value={password} onChangeText={setPassword} />
          <InputField
            label="Confirm Password"
            placeholder="••••••••••••"
            leftIcon="lock-closed-outline"
            isPassword
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Text style={styles.label}>I want to</Text>
          <View style={styles.roleRow}>
            <Pressable
              style={[styles.roleCard, role === 'renter' ? styles.roleCardActive : undefined]}
              onPress={() => setRole('renter')}
              accessibilityLabel="Sign up as a renter"
            >
              <Ionicons name="car-sport-outline" size={22} color={role === 'renter' ? colors.onPrimary : colors.textPrimary} />
              <Text style={[styles.roleTitle, role === 'renter' ? styles.roleTitleActive : undefined]}>Rent Cars</Text>
              <Text style={[styles.roleSubtitle, role === 'renter' ? styles.roleSubtitleActive : undefined]}>Browse & book</Text>
            </Pressable>
            <Pressable
              style={[styles.roleCard, role === 'owner' ? styles.roleCardActive : undefined]}
              onPress={() => setRole('owner')}
              accessibilityLabel="Sign up as a rental owner"
            >
              <Ionicons name="key-outline" size={22} color={role === 'owner' ? colors.onPrimary : colors.textPrimary} />
              <Text style={[styles.roleTitle, role === 'owner' ? styles.roleTitleActive : undefined]}>List My Car</Text>
              <Text style={[styles.roleSubtitle, role === 'owner' ? styles.roleSubtitleActive : undefined]}>Earn as an owner</Text>
            </Pressable>
          </View>

          <InputField
            label="Referral Code (optional)"
            placeholder="VLRXXXXX"
            leftIcon="gift-outline"
            autoCapitalize="characters"
            value={referralCode}
            onChangeText={(text) => {
              setReferralCode(text);
              setReferralNote(undefined);
            }}
          />
          {referralNote ? <Text style={styles.referralNote}>{referralNote}</Text> : null}

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <PrimaryButton label="Create Account" onPress={onSignup} loading={loading} style={{ marginTop: spacing.md }} />
        </View>
      </ScrollView>

      <EmailVerificationModal
        visible={showVerificationModal}
        email={email.trim()}
        onResend={resendVerificationEmail}
        onClose={() => {
          setShowVerificationModal(false);
          // Nothing to do here yet -- log in is the only next real action,
          // and staying on the signup form after a completed signup invites
          // a confusing second attempt at creating the same account.
          navigation.navigate('Login');
        }}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  hero: { height: 220, backgroundColor: colors.black },
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
  segmentRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill, padding: 4, marginBottom: spacing.lg },
  segment: { flex: 1, paddingVertical: 12, borderRadius: radii.pill, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.onPrimary },
  segmentText: { ...typography.titleMd, color: colors.textSecondary },
  segmentTextActive: { ...typography.titleMd, color: colors.white },
  title: { ...typography.displayMd, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  roleRow: { flexDirection: 'row', marginBottom: spacing.md },
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
  referralNote: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },
});
