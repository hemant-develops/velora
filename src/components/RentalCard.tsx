import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Booking, Car } from '../types';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { formatCurrency, formatShortDate } from '../utils/format';
import { FallbackImage } from './FallbackImage';

const statusStyles: Record<Booking['status'], { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.warningBg, fg: colors.warning, label: 'Pending' },
  upcoming: { bg: colors.infoBg, fg: colors.info, label: 'Upcoming' },
  active: { bg: colors.successBg, fg: colors.success, label: 'Active' },
  completed: { bg: colors.surface, fg: colors.textSecondary, label: 'Completed' },
  cancelled: { bg: colors.dangerBg, fg: colors.danger, label: 'Cancelled' },
  rejected: { bg: colors.dangerBg, fg: colors.danger, label: 'Declined' },
};

interface Props {
  booking: Booking;
  car?: Car;
  onPress: () => void;
  style?: ViewStyle;
}

export const RentalCard: React.FC<Props> = ({ booking, car, onPress, style }) => {
  const status = statusStyles[booking.status];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadows.sm, style, pressed ? styles.cardPressed : undefined]}
    >
      <FallbackImage uri={car?.images[0]} style={styles.image} />
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={typography.titleLg} numberOfLines={1}>
            {car?.name ?? 'Vehicle'}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.bookingId} numberOfLines={1}>#{booking.id}</Text>
        <Text style={styles.dates}>
          {formatShortDate(booking.pickupDate)} - {formatShortDate(booking.dropoffDate)} · {booking.days} day
          {booking.days === 1 ? '' : 's'}
        </Text>
        <Text style={styles.total}>{formatCurrency(booking.total)}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  // Same cheap opacity-dip press feedback as CarCard -- no Animated API,
  // just Pressable's own per-press style function.
  cardPressed: { opacity: 0.92 },
  image: { width: 96, height: '100%', minHeight: 100, backgroundColor: colors.surface },
  info: { flex: 1, padding: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, marginLeft: 6 },
  statusText: { ...typography.caption, fontWeight: '700' },
  bookingId: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  dates: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6 },
  total: { ...typography.headingSm, color: colors.textPrimary, marginTop: 8 },
});
