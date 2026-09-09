import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { formatCurrency, formatShortDate } from '../../utils/format';
import { FallbackImage } from '../../components/FallbackImage';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingConfirmation'>;

export const BookingConfirmationScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { bookings } = useBookings();
  const { getCarById } = useCars();
  const booking = bookings.find((b) => b.id === route.params.bookingId);
  const car = booking ? getCarById(booking.carId) : undefined;

  if (!booking || !car) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <EmptyState icon="alert-circle-outline" title="Booking not found" />
      </View>
    );
  }

  // A brand-new booking always lands here in 'pending' state (see
  // BookingsContext.createBooking) — it's a request the owner still needs
  // to accept, not a done deal yet, so the copy reflects that rather than
  // claiming a confirmation that hasn't happened.
  const isPending = booking.status === 'pending';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxl }}>
        <View style={[styles.successCircle, isPending ? { backgroundColor: colors.warning } : undefined]}>
          <Ionicons name={isPending ? 'time' : 'checkmark'} size={40} color={colors.white} />
        </View>
        <Text style={styles.title}>{isPending ? 'Booking Request Sent!' : 'Booking Confirmed!'}</Text>
        <Text style={styles.subtitle}>
          {isPending
            ? "Your request has been sent to the owner. You'll get a notification the moment they confirm it."
            : 'Your ride is booked. Details have been sent to your inbox.'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.bookingId}>Booking ID</Text>
          <Text style={styles.bookingIdValue}>{booking.id}</Text>

          <View style={styles.carRow}>
            <FallbackImage uri={car.images[0]} style={styles.carImage} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
              <Text style={styles.carMeta}>{car.category}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Rental Type</Text>
            <Text style={styles.value}>{booking.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pickup</Text>
            <Text style={styles.value}>{formatShortDate(booking.pickupDate)} · {booking.pickupTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Drop-off</Text>
            <Text style={styles.value}>{formatShortDate(booking.dropoffDate)} · {booking.dropoffTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>{booking.days} day{booking.days === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Paid via</Text>
            <Text style={styles.value}>{booking.paymentMethod}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Agreement</Text>
            <Text style={styles.value}>Signed by {booking.agreementSignedBy}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>{formatCurrency(booking.total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          label="View My Rents"
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main', params: { screen: 'RentsTab' } }],
            })
          }
        />
        <PrimaryButton
          label="Back to Home"
          variant="outline"
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main', params: { screen: 'HomeTab' } }],
            })
          }
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  successCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.displayMd, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg },
  bookingId: { ...typography.bodySm, color: colors.textSecondary },
  bookingIdValue: { ...typography.headingSm, color: colors.textPrimary, marginTop: 2, marginBottom: spacing.md },
  carRow: { flexDirection: 'row', alignItems: 'center' },
  carImage: { width: 60, height: 60, borderRadius: radii.md, backgroundColor: colors.card },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  label: { ...typography.bodyMd, color: colors.textSecondary },
  value: { ...typography.titleMd, color: colors.textPrimary },
  totalLabel: { ...typography.titleLg, color: colors.textPrimary },
  totalValue: { ...typography.headingSm, color: colors.textPrimary },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background },
});
