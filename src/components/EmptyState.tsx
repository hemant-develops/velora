import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';
import { PrimaryButton } from './PrimaryButton';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  // B3.5 -- optional action button, added so an empty state can point
  // somewhere useful ("Browse Cars") instead of only describing the empty
  // state. Both props are optional and only one new call site (My Rents)
  // uses them so far -- every other existing EmptyState usage across the
  // app renders exactly as before.
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<Props> = ({ icon = 'search-outline', title, subtitle, actionLabel, onAction }) => (
  <View style={styles.wrap}>
    <View style={styles.iconCircle}>
      <Ionicons name={icon} size={30} color={colors.textTertiary} />
    </View>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    {actionLabel && onAction ? (
      <PrimaryButton label={actionLabel} onPress={onAction} size="sm" fullWidth={false} style={styles.action} />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  action: { marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.titleLg, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },
});
