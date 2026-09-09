import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { isValidEmail } from '../../utils/format';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  const onSend = () => {
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(undefined);
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        {sent ? (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We've sent password reset instructions to {email}. (Demo mode — no email is actually sent.)
            </Text>
            <PrimaryButton label="Back to Login" onPress={() => navigation.navigate('Login')} style={{ marginTop: spacing.lg }} />
          </>
        ) : (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={32} color={colors.textPrimary} />
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>Enter the email linked to your account and we'll send reset instructions.</Text>
            <InputField
              label="Email Address"
              placeholder="you@example.com"
              leftIcon="mail-outline"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={error}
              style={{ marginTop: spacing.lg }}
            />
            <PrimaryButton label="Send Reset Link" onPress={onSend} style={{ marginTop: spacing.sm }} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.displayMd, color: colors.textPrimary, marginBottom: 8 },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 22 },
});
