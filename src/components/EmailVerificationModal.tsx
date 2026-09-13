import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { AuthResult } from '../context/AuthContext';

// PRODUCT IMPROVEMENT -- signup's "check your email" moment used to be a
// single line of inline text on SignupScreen, easy to miss and inconsistent
// with how VELORA handles every other important system event (see
// UpdateBanner). This gives it the same weight as the account-creation
// moment deserves: a focused modal that confirms what happened, which email
// it went to, and gives a real next action -- open the mail app or resend --
// instead of leaving the person to just believe it worked.
//
// Resend cooldown exists because Supabase's own `auth.resend()` endpoint is
// rate-limited server-side; without a client-side cooldown, a person
// double-tapping "Resend" gets a raw rate-limit error instead of a UI that
// already anticipated it.
const RESEND_COOLDOWN_SECONDS = 45;

interface EmailVerificationModalProps {
  visible: boolean;
  email: string;
  onClose: () => void;
  onResend: (email: string) => Promise<AuthResult>;
}

type ResendState = 'idle' | 'sending' | 'sent' | 'error';

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({ visible, email, onClose, onResend }) => {
  const [resendState, setResendState] = useState<ResendState>('idle');
  const [resendError, setResendError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fresh modal instance each time it opens (SignupScreen only mounts it
    // while `visible`), but guard state/timers anyway in case a future
    // caller keeps it mounted and just toggles `visible`.
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      setResendState('idle');
      setResendError(undefined);
      setCooldown(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onResendPress = async () => {
    if (resendState === 'sending' || cooldown > 0) return;
    setResendState('sending');
    setResendError(undefined);
    try {
      const result = await onResend(email);
      if (result.success) {
        setResendState('sent');
      } else {
        setResendState('error');
        setResendError(result.error ?? "Couldn't resend the email. Please try again.");
      }
    } catch (err) {
      setResendState('error');
      setResendError(err instanceof Error ? err.message : "Couldn't resend the email. Please try again.");
    } finally {
      // Cooldown starts regardless of outcome -- a failure is very often
      // ITSELF the server's own rate limit, so retrying instantly would
      // just fail the same way again.
      startCooldown();
    }
  };

  // Handle Android/iOS intent failures safely -- this app doesn't declare
  // any native <queries> entries (that would need a rebuild), so
  // Linking.canOpenURL for a specific app scheme like Gmail's can't be
  // trusted to resolve correctly on modern Android. `mailto:` is a standard
  // scheme every platform supports without extra manifest entries, and
  // reliably prompts the OS's own mail-app chooser (Gmail included, if
  // installed) instead of guessing which app to launch directly.
  const onOpenMailPress = async () => {
    try {
      await Linking.openURL('mailto:');
    } catch (err) {
      console.log(`VELORA_OPEN_MAIL_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
      // Deliberately not an Alert -- this modal is already the surface for
      // this moment; a stacked native Alert on top of it would feel broken.
      // The email address shown below is the fallback: the person can open
      // their mail app manually and search for it.
      setResendError('Could not open a mail app automatically. Please check your email app manually.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.lg]}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-unread-outline" size={30} color={colors.primaryDark} />
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            Your VELORA account has been created. We've sent a verification link to:
          </Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.hint}>Open the link in that email, then come back here and log in.</Text>

          {resendState === 'sent' ? (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.statusTextSuccess}>Verification email sent again.</Text>
            </View>
          ) : resendState === 'error' && resendError ? (
            <View style={styles.statusRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.statusTextError}>{resendError}</Text>
            </View>
          ) : null}

          <Pressable style={styles.primaryBtn} onPress={onOpenMailPress} accessibilityRole="button" accessibilityLabel="Open mail app">
            <Ionicons name="mail-open-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Open Mail App</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, (cooldown > 0 || resendState === 'sending') && styles.secondaryBtnDisabled]}
            onPress={onResendPress}
            disabled={cooldown > 0 || resendState === 'sending'}
            accessibilityRole="button"
            accessibilityLabel="Resend verification email"
          >
            {resendState === 'sending' ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.secondaryBtnText}>
                {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend verification email'}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeBtnText}>I'll do this later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.displayMd, color: colors.textPrimary, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  email: { ...typography.titleMd, color: colors.textPrimary, marginTop: spacing.xs, textAlign: 'center' },
  hint: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  statusTextSuccess: { ...typography.bodySm, color: colors.success, marginLeft: 6, flexShrink: 1 },
  statusTextError: { ...typography.bodySm, color: colors.danger, marginLeft: 6, flexShrink: 1 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 48,
    width: '100%',
    marginTop: spacing.xs,
  },
  primaryBtnText: { ...typography.titleMd, color: colors.onPrimary, marginLeft: spacing.xs },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    width: '100%',
    marginTop: spacing.sm,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnText: { ...typography.titleMd, color: colors.primaryDark },
  closeBtn: { marginTop: spacing.xs, paddingVertical: spacing.xs },
  closeBtnText: { ...typography.bodySm, color: colors.textTertiary },
});
