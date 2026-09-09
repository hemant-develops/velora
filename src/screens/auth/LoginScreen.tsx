import React, { useState } from 'react';
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
import { UserRole } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('renter');
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError(undefined);
    setInfo(undefined);
    setLoading(true);
    const result = await login(email, password, role);
    setLoading(false);
    if (!result.success) setError(result.error);
    else if (result.info) setInfo(result.info);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>Or</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.socialRow}>
            <Pressable style={styles.socialBtn} onPress={onLogin}>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={styles.socialText}>Google</Text>
            </Pressable>
            <Pressable style={styles.socialBtn} onPress={onLogin}>
              <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
              <Text style={styles.socialText}>Apple</Text>
            </Pressable>
          </View>

          <Text style={styles.demoNote}>Demo mode: any email &amp; password logs you in instantly, in the mode you pick above.</Text>
        </View>
      </ScrollView>
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
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { ...typography.bodySm, color: colors.textSecondary, marginHorizontal: spacing.sm },
  socialRow: { flexDirection: 'row' },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  socialText: { ...typography.titleMd, color: colors.textPrimary, marginLeft: 8 },
  demoNote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});
