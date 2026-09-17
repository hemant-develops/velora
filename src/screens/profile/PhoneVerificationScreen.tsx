import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneVerification'>;

const RESEND_COOLDOWN_SECONDS = 30;

// PHONE IDENTITY BINDING -- for an already-authenticated email/Google
// account to bind and verify a phone number onto itself (see
// AuthContext.sendPhoneBindOtp/verifyPhoneBindOtp). Same OTP UX pattern as
// LoginScreen's standalone phone-login flow, reused deliberately for
// consistency, but calling the bind-specific pair of functions -- this
// never creates or signs into a different session.
export const PhoneVerificationScreen: React.FC<Props> = ({ navigation }) => {
  const { user, sendPhoneBindOtp, verifyPhoneBindOtp } = useAuth();
  const alreadyVerified = user?.phoneVerification?.verified ?? false;

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
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

  const onSendOtp = async () => {
    if (sendLoading) return;
    setError(undefined);
    setSendLoading(true);
    const result = await sendPhoneBindOtp(phone);
    setSendLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOtpSent(true);
    startResendCooldown();
  };

  const onResendOtp = async () => {
    if (resendCooldown > 0 || sendLoading) return;
    await onSendOtp();
  };

  const onVerifyOtp = async () => {
    if (verifyLoading) return;
    setError(undefined);
    setVerifyLoading(true);
    const result = await verifyPhoneBindOtp(phone, otp);
    setVerifyLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    navigation.goBack();
  };

  if (alreadyVerified) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Phone Verification" onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Ionicons name="shield-checkmark" size={40} color={colors.success} />
          <Text style={styles.introTitle}>Phone verified</Text>
          <Text style={styles.introBody}>+91 {user?.phoneVerification?.phone?.replace('+91', '')} is verified on this account.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Phone Verification" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.introCard}>
          <Ionicons name="call" size={28} color={colors.primaryDark} />
          <Text style={styles.introTitle}>Verify your phone number</Text>
          <Text style={styles.introBody}>
            One verified phone number can only ever be linked to one VELORA account, keeping the marketplace trustworthy for
            everyone.
          </Text>
        </View>

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
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              label={sendLoading ? 'Sending…' : 'Send OTP'}
              onPress={onSendOtp}
              loading={sendLoading}
              disabled={sendLoading}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : (
          <>
            <Text style={styles.otpSentNote}>Code sent to +91 {phone.trim()}.</Text>
            <InputField
              label="6-Digit Code"
              placeholder="123456"
              leftIcon="keypad-outline"
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              label={resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : sendLoading ? 'Resending…' : 'Resend OTP'}
              onPress={onResendOtp}
              variant="outline"
              disabled={resendCooldown > 0 || sendLoading}
              style={{ marginTop: spacing.sm }}
            />
            <PrimaryButton
              label={verifyLoading ? 'Verifying…' : 'Verify Phone'}
              onPress={onVerifyOtp}
              loading={verifyLoading}
              disabled={verifyLoading}
              style={{ marginTop: spacing.sm }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  introCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  introTitle: { ...typography.headingSm, color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' },
  introBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  otpSentNote: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
  error: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
});
