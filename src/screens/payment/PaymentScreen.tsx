import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useRewards } from '../../context/RewardsContext';
import { processPayment, PaymentMethodKey } from '../../lib/paymentGateway';
import { formatCurrency, formatShortDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Payment'>;

const METHODS: { key: PaymentMethodKey; label: string; icon: keyof typeof Ionicons.glyphMap; caption: string }[] = [
  { key: 'upi', label: 'UPI', icon: 'flash-outline', caption: 'Google Pay, PhonePe, Paytm' },
  { key: 'card', label: 'Credit / Debit Card', icon: 'card-outline', caption: 'Visa, Mastercard, RuPay' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', caption: 'VELORA Wallet balance' },
  { key: 'cash', label: 'Cash / Pay Later', icon: 'cash-outline', caption: 'Pay at pickup' },
];

export const PaymentScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { bookingId } = route.params;
  const { user } = useAuth();
  const { getCarById } = useCars();
  const { getBookingById, recordPaymentResult } = useBookings();
  const { getBalance, spendCredits } = useRewards();
  const rawBooking = getBookingById(bookingId);
  // Final-verification fix -- only the renter who made this booking may pay
  // for it (and see its price breakdown). getBookingById(id) has no
  // participant check of its own, so without this a foreign/guessed
  // bookingId could both view and mutate (recordPaymentResult) someone
  // else's booking.
  const booking = rawBooking && user && rawBooking.renterId === user.id ? rawBooking : undefined;
  const car = booking ? getCarById(booking.carId) : undefined;
  // Real balance, not a decorative number -- see RewardsContext. Used both
  // to show the actual figure next to "Wallet" below and to gate whether
  // that method can even be selected/paid with.
  const walletBalance = user ? getBalance(user.id) : 0;
  // No new field is stored on Booking for this -- total already has any
  // promo discount baked in (see BookingScreen/RentalAgreementScreen), so
  // the discount amount for display is just the gap between the
  // pre-discount sum and the stored total.
  const discount = booking ? Math.max(booking.subtotal + booking.taxes + booking.serviceFee - booking.total, 0) : 0;
  // PAYMENT METHODS FIX -- pre-select whatever default the person picked on
  // the Payment Methods screen (see AppUser.preferredPaymentMethod) instead
  // of always starting on UPI regardless of what they normally use. Falls
  // back to 'upi' for anyone who's never set one, unchanged from before.
  const [method, setMethod] = useState<PaymentMethodKey>(user?.preferredPaymentMethod ?? 'upi');
  const [processing, setProcessing] = useState(false);
  // M10 -- the last attempt's outcome, shown inline instead of only a
  // one-shot Alert, so a failed attempt reads as a clear, persistent state
  // (not a dead end) rather than something the renter might miss or forget
  // once the popup is dismissed. Cleared the moment they pick a different
  // method, since that's a fresh attempt.
  const [lastError, setLastError] = useState<string | undefined>();

  // The booking already exists by the time this screen is ever reached
  // (see RentalAgreementScreen.onSign) -- this branch is only for a
  // corrupted/stale bookingId, not part of the normal flow.
  if (!booking || !car) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Unable to load payment details" />
      </View>
    );
  }

  const methodLabel = METHODS.find((m) => m.key === method)?.label ?? 'UPI';

  const onSelectMethod = (key: PaymentMethodKey) => {
    setMethod(key);
    setLastError(undefined);
  };

  const onPayNow = async () => {
    setProcessing(true);
    setLastError(undefined);
    try {
      // Payment does NOT create the booking -- it already exists (created in
      // RentalAgreementScreen, before this screen ever showed, and already
      // visible in My Rents / the owner's Bookings tab). This screen only
      // ever records the outcome of a payment attempt; the booking's
      // identity, dates, amount and inventory hold were already settled
      // earlier and are untouched here. See src/lib/paymentGateway.ts for
      // why this is a mock (no real gateway is configured) and what a real
      // integration would replace. The in-flight "processing" state is this
      // screen's own local `processing` boolean (the button's spinner) --
      // there's no need to persist an interim 'processing' paymentStatus for
      // a mock gateway that always resolves in one round trip; a real
      // async/webhook-based gateway is exactly where that value would start
      // being written and read from elsewhere.
      //
      // "Wallet" is the one method that is NOT routed through the mock
      // gateway -- it is the renter's own real VELORA Credits balance (see
      // RewardsContext), so paying with it is a real, deterministic debit
      // against a real ledger, not a simulated charge with a random decline
      // rate. It never touches processPayment/paymentGateway.ts at all.
      if (method === 'wallet') {
        if (!user) throw new Error('You need to be signed in to pay.');
        const spendResult = await spendCredits(user.id, booking.total, `Booking payment - ${car.name}`);
        if (!spendResult.success) {
          await recordPaymentResult({
            bookingId: booking.id,
            paymentMethod: methodLabel,
            status: 'failed',
            failureReason: spendResult.error,
          });
          setLastError(spendResult.error ?? "We couldn't complete this payment from your wallet.");
          setProcessing(false);
          return;
        }
        // BUG FIX -- the wallet debit above already happened for real; if
        // this record write fails, the renter must NOT be shown a
        // confirmation screen for a payment the booking row doesn't
        // actually reflect yet.
        const recorded = await recordPaymentResult({
          bookingId: booking.id,
          paymentMethod: methodLabel,
          status: 'paid',
          transactionId: `WALLET-${booking.id}`,
        });
        if (!recorded) {
          setLastError('Your wallet was charged, but we could not update the booking. Please contact support before paying again.');
          setProcessing(false);
          return;
        }
        navigation.replace('BookingConfirmation', { bookingId: booking.id });
        return;
      }

      const result = await processPayment({ bookingId: booking.id, method, amount: booking.total });
      if (result.success) {
        const recorded = await recordPaymentResult({
          bookingId: booking.id,
          paymentMethod: methodLabel,
          // Cash/Pay Later is never actually charged now -- it stays
          // 'unpaid' (due at pickup) rather than falsely claiming 'paid'.
          status: method === 'cash' ? 'unpaid' : 'paid',
          transactionId: result.transactionId,
        });
        if (!recorded) {
          setLastError("Payment went through, but we couldn't update the booking. Please try again or contact support.");
          setProcessing(false);
          return;
        }
        navigation.replace('BookingConfirmation', { bookingId: booking.id });
        return;
      }
      await recordPaymentResult({
        bookingId: booking.id,
        paymentMethod: methodLabel,
        status: 'failed',
        failureReason: result.error,
      });
      setLastError(result.error ?? "We couldn't confirm the booking right now. Please try again.");
    } catch (error) {
      // An unexpected failure (e.g. local storage write error) rather than
      // a gateway decline -- never leave the renter on a stuck spinner with
      // no way forward.
      const message = error instanceof Error ? error.message : "We couldn't confirm the booking right now. Please try again.";
      setLastError(message);
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
            {booking.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'} · {formatShortDate(booking.pickupDate)} -{' '}
            {formatShortDate(booking.dropoffDate)}
          </Text>
          <Text style={styles.summaryCaption}>Agreement signed by {booking.agreementSignedBy}</Text>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowValue}>{formatCurrency(booking.subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Taxes</Text>
            <Text style={styles.rowValue}>{formatCurrency(booking.taxes)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Service fee</Text>
            <Text style={styles.rowValue}>{formatCurrency(booking.serviceFee)}</Text>
          </View>
          {discount > 0 ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.success }]}>Promo discount</Text>
              <Text style={[styles.rowValue, { color: colors.success }]}>-{formatCurrency(discount)}</Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <Text style={styles.totalValue}>{formatCurrency(booking.total)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose Payment Method</Text>
        {METHODS.map((m) => {
          const selected = method === m.key;
          const walletInsufficient = m.key === 'wallet' && walletBalance < booking.total;
          const disabled = processing || walletInsufficient;
          return (
            <Pressable
              key={m.key}
              onPress={() => onSelectMethod(m.key)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={m.label}
              style={({ pressed }) => [
                styles.methodRow,
                selected ? styles.methodRowSelected : undefined,
                pressed ? styles.methodRowPressed : undefined,
                walletInsufficient ? styles.methodRowDisabled : undefined,
              ]}
            >
              <View style={styles.methodIconCircle}>
                <Ionicons name={m.icon} size={18} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <View style={styles.methodTitleRow}>
                  <Text style={typography.titleMd}>{m.label}</Text>
                  {m.key === 'upi' ? (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>Recommended</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.methodCaption}>
                  {m.key === 'wallet'
                    ? walletInsufficient
                      ? `Balance ${formatCurrency(walletBalance)} — not enough for this booking`
                      : `Balance ${formatCurrency(walletBalance)} available`
                    : m.caption}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={disabled ? colors.textTertiary : selected ? colors.primaryDark : colors.textTertiary}
              />
            </Pressable>
          );
        })}

        {lastError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorBannerText}>{lastError}</Text>
          </View>
        ) : null}

        <Text style={styles.note}>
          {method === 'cash'
            ? 'Nothing is charged now — pay the owner directly at pickup.'
            : method === 'wallet'
              ? 'Paid instantly from your real VELORA Credits balance.'
              : 'Demo mode: no real payment gateway is connected, so no real money moves.'}
        </Text>
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.trustRow}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.trustRowText}>Your payment details stay private to this booking.</Text>
        </View>
        <PrimaryButton
          label={
            processing
              ? 'Processing...'
              : lastError
                ? 'Try Again'
                : method === 'cash'
                  ? 'Confirm Booking'
                  : `Pay ${formatCurrency(booking.total)}`
          }
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
  methodRowPressed: { opacity: 0.85 },
  methodRowDisabled: { opacity: 0.5 },
  methodIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center' },
  recommendedBadge: { backgroundColor: colors.successBg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: spacing.xs },
  recommendedBadgeText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  methodCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  trustRowText: { ...typography.caption, color: colors.textTertiary, marginLeft: 5 },
  note: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dangerBg,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  errorBannerText: { ...typography.bodySm, color: colors.danger, marginLeft: 8, flex: 1, lineHeight: 18 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
