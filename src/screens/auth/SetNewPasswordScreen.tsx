import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';

// SECURITY FIX -- rendered directly by AppNavigation (see its own comment)
// whenever passwordRecoveryPending is true, i.e. the active session came
// from a Supabase password-recovery email link rather than a normal
// login/signup. There is deliberately no "back" navigation here: the
// person already has a live, valid session at this point (that's how the
// recovery link works), so the only two sane outcomes are "set a new
// password" or "sign out" -- there is no App screen to go "back" to that
// wouldn't just be the account they're mid-recovery on.
export const SetNewPasswordScreen: React.FC = () => {
  const { updatePassword, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(undefined);
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name={done ? 'checkmark-circle' : 'lock-closed-outline'} size={32} color={done ? colors.success : colors.textPrimary} />
        </View>
        <Text style={styles.title}>{done ? 'Password updated' : 'Set a new password'}</Text>
        <Text style={styles.subtitle}>
          {done
            ? 'Your password has been changed. Continuing into VELORA…'
            : 'Choose a new password for your VELORA account to finish resetting it.'}
        </Text>
        {!done && (
          <>
            <InputField
              label="New Password"
              placeholder="At least 6 characters"
              leftIcon="lock-closed-outline"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={{ marginTop: spacing.lg }}
            />
            <InputField
              label="Confirm New Password"
              placeholder="Re-enter your new password"
              leftIcon="lock-closed-outline"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={error}
              style={{ marginTop: spacing.sm }}
            />
            <PrimaryButton label="Update Password" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.md }} />
            <PrimaryButton label="Cancel and Sign Out" onPress={() => logout()} variant="outline" style={{ marginTop: spacing.sm }} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
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
