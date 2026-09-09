import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { formatCurrency, formatShortDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Payment'>;

type PaymentMethod = 'upi' | 'card' | 'wallet' | 'cash';

const METHODS: { key: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap; caption: string }[] = [
  { key: 'upi', label: 'UPI', icon: 'flash-outline', caption: 'Google Pay, PhonePe, Paytm' },
  { key: 'card', label: 'Credit / Debit Card', icon: 'card-outline', caption: 'Visa, Mastercard, RuPay' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', caption: 'VELORA Wallet balance' },
  { key: 'cash', label: 'Cash / Pay Later', icon: 'cash-outline', caption: 'Pay at pickup' },
];

export const PaymentScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const draft = route.params;
  const { user } = useAuth();
  const { getCarById } = useCars();
  const { createBooking } = useBookings();
  const car = getCarById(draft.carId);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [processing, setProcessing] = useState(false);

  if (!car || !user) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <EmptyState icon="alert-circle-outline" title="Unable to load payment details" />
      </View>
    );
  }

  const methodLabel = METHODS.find((m) => m.key === method)?.label ?? 'UPI';

  const onPayNow = async () => {
    setProcessing(true);
    // Simulate a short mock payment processing delay before "success".
    await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      const booking = await createBooking({
        carId: draft.carId,
        renterId: user.id,
        renterName: user.name,
        rentalMode: draft.rentalMode,
        pickupLocation: draft.pickupLocation,
        dropoffLocation: draft.dropoffLocation,
        pickupDate: draft.pickupDate,
        dropoffDate: draft.dropoffDate,
        pickupTime: draft.pickupTime,
        dropoffTime: draft.dropoffTime,
        days: draft.days,
        subtotal: draft.subtotal,
        taxes: draft.taxes,
        serviceFee: draft.serviceFee,
        total: draft.total,
        paymentMethod: methodLabel,
        agreementSignedBy: draft.agreementSignedBy,
        agreementSignedAt: draft.agreementSignedAt,
      });
      navigation.replace('BookingConfirmation', { bookingId: booking.id });
    } catch (error) {
      // Most likely a date-overlap rejection from BookingsContext — no
      // payment was actually charged (this is mock payment), so it's safe
      // to just tell the person and let them adjust dates or go back.
      const message = error instanceof Error ? error.message : 'Something went wrong while creating your booking.';
      Alert.alert('Booking Unavailable', message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Payment" onBack={() => navigation.goBack()} backDisabled={processing} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}>
        <View style={[styles.summaryCard, shadows.sm]}>
          <Text style={typography.titleLg}>{car.name}</Text>
          <Text style={styles.summaryCaption}>
            {draft.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'} · {formatShortDate(draft.pickupDate)} -{' '}
            {formatShortDate(draft.dropoffDate)}
          </Text>
          <Text style={styles.summaryCaption}>Agreement signed by {draft.agreementSignedBy}</Text>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowValue}>{formatCurrency(draft.subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Taxes</Text>
            <Text style={styles.rowValue}>{formatCurrency(draft.taxes)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Service fee</Text>
            <Text style={styles.rowValue}>{formatCurrency(draft.serviceFee)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <Text style={styles.totalValue}>{formatCurrency(draft.total)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose Payment Method</Text>
        {METHODS.map((m) => {
          const selected = method === m.key;
          return (
            <View
              key={m.key}
              style={[styles.methodRow, selected ? styles.methodRowSelected : undefined]}
              onTouchEnd={() => setMethod(m.key)}
            >
              <View style={styles.methodIconCircle}>
                <Ionicons name={m.icon} size={18} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={typography.titleMd}>{m.label}</Text>
                <Text style={styles.methodCaption}>{m.caption}</Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primaryDark : colors.textTertiary}
              />
            </View>
          );
        })}

        <Text style={styles.note}>Demo mode: no real payment is processed.</Text>
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          label={processing ? 'Processing...' : `Pay ${formatCurrency(draft.total)}`}
          onPress={onPayNow}
          loading={processing}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md },
  summaryCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  rowLabel: { ...typography.bodyMd, color: colors.textSecondary },
  rowValue: { ...typography.titleMd, color: colors.textPrimary },
  totalLabel: { ...typography.titleLg, color: colors.textPrimary },
  totalValue: { ...typography.headingSm, color: colors.textPrimary },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodRowSelected: { borderColor: colors.onPrimary, backgroundColor: colors.white },
  methodIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  methodCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  note: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
