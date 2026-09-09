import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  subtitle?: string;
  // Real unread-count badge (e.g. for "Notifications") — only ever passed a
  // genuine count from NotificationsContext, never a fabricated number.
  // Omitted or 0 renders no badge at all.
  badgeCount?: number;
}

export const ProfileMenuItem: React.FC<Props> = ({ icon, label, onPress, destructive, subtitle, badgeCount }) => (
  <Pressable style={styles.row} onPress={onPress}>
    <View style={[styles.iconCircle, destructive ? styles.iconCircleDanger : undefined]}>
      <Ionicons name={icon} size={18} color={destructive ? colors.danger : colors.textPrimary} />
    </View>
    <View style={{ flex: 1, marginLeft: spacing.sm }}>
      <Text style={[typography.titleMd, destructive ? { color: colors.danger } : undefined]}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {badgeCount ? (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
      </View>
    ) : null}
    {!destructive ? <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2 },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDanger: { backgroundColor: colors.dangerBg },
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginRight: spacing.xs,
  },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 10.5 },
});
