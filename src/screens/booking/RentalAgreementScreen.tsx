import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { FallbackImage } from '../../components/FallbackImage';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatShortDate } from '../../utils/format';
import { CANCELLATION_POLICY_TEXT } from '../../utils/policy';

type Props = NativeStackScreenProps<RootStackParamList, 'Agreement'>;
// Clears the absolutely-positioned "Agree & Sign" footer below the scroll content.
const FOOTER_CLEARANCE = 220;

export const RentalAgreementScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getCarById } = useCars();
  const { createBooking } = useBookings();
  const draft = route.params;
  const car = getCarById(draft.carId);

  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(user?.name ?? '');
  const [submitting, setSubmitting] = useState(false);

  const today = useMemo(() => formatShortDate(new Date().toISOString()), []);
  const canSign = agreed && signature.trim().length > 1;
  // No new field is stored anywhere for this -- draft.total already has any
  // promo discount baked in (see BookingScreen), so the discount amount for
  // display is just the gap between the pre-discount sum and that total.
  const discount = Math.max(draft.subtotal + draft.taxes + draft.serviceFee - draft.total, 0);

  if (!car || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Unable to load the rental agreement" />
      </View>
    );
  }

  // This is where the booking actually becomes a persistent record --
  // BEFORE Payment is ever shown, not when the (mock) payment is paid. See
  // BookingsContext.createBooking: it validates the car/dates, syncs
  // inventory, and only returns once the Supabase local_car_inventory hold
  // has actually been granted and the booking is written to the shared
  // Supabase `bookings` table -- so by the time navigation.navigate('Payment', ...)
  // below runs, the booking already exists and will show up in My
  // Rents/the owner's Bookings tab even if the renter backs out of Payment
  // without ever tapping Pay. paymentMethod is a placeholder here because
  // it isn't chosen until the next screen -- PaymentScreen records the
  // actual method and outcome via BookingsContext.recordPaymentResult (M10)
  // once the renter actually picks one and pays; no other field on the
  // booking changes after this point.
  const onSign = async () => {
    if (!canSign || submitting) return;
    // PHONE IDENTITY BINDING -- a UI-level gate only (createBooking itself
    // is untouched below); a renter with no Supabase-Auth-verified phone
    // on their account cannot start the booking that would otherwise be
    // created here. See AuthContext.phoneVerification / PhoneVerificationScreen.
    if (!user.phoneVerification?.verified) {
      Alert.alert('Verify your phone to continue', 'For marketplace trust and safety, verify your phone number before booking.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Verify Phone', onPress: () => navigation.navigate('PhoneVerification') },
      ]);
      return;
    }
    setSubmitting(true);
    try {
      const booking = await createBooking({
        carId: draft.carId,
        renterId: user.id,
        renterName: user.name,
        renterAvatar: user.avatar,
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
        paymentMethod: 'Not selected yet',
        agreementSignedBy: signature.trim(),
        agreementSignedAt: new Date().toISOString(),
      });
      // ADMIN CONNECT -- records real usage against the admin-managed promo
      // code exactly once, now that the booking this discount actually
      // applied to is confirmed created. Best-effort: a failure here must
      // never block a booking that has already been created and already
      // has its discount baked into draft.total (same fire-and-forget
      // tolerance already used elsewhere for non-critical side effects,
      // e.g. CarsContext.syncCarInventory's own catch).
      if (draft.promoCode) {
        supabase.rpc('redeem_promo_code', { p_code: draft.promoCode }).then(({ error }) => {
          if (error) console.log(`VELORA_PROMO_REDEEM_ERROR code=${draft.promoCode} message=${error.message}`);
        });
      }
      navigation.navigate('Payment', { bookingId: booking.id });
    } catch (error) {
      // Most likely a date-overlap/fully-booked rejection from
      // BookingsContext, already translated to friendly text there -- no
      // booking was created, so there's nothing to clean up; the renter
      // stays on this screen and can go back to pick different dates.
      const message = error instanceof Error ? error.message : 'Something went wrong while creating your booking.';
      Alert.alert('Booking Unavailable', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Rental Agreement" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: FOOTER_CLEARANCE }} showsVerticalScrollIndicator={false}>
        <View style={[styles.carRow, shadows.sm]}>
          <FallbackImage uri={car.images[0]} style={styles.carImage} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.carMeta}>
              {draft.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'} · {formatShortDate(draft.pickupDate)} - {formatShortDate(draft.dropoffDate)}
            </Text>
          </View>
        </View>

        <View style={styles.docCard}>
          <Text style={styles.docTitle}>VELORA Vehicle Rental Agreement</Text>
          <Text style={styles.docMeta}>Prepared {today} · Agreement ref VLR-AGR-{car.id.toUpperCase()}</Text>

          <Text style={styles.clauseHeading}>1. Parties &amp; Vehicle</Text>
          <Text style={styles.clauseBody}>
            This agreement is between {user.name} ("the Renter") and the owner of {car.name} ("the Owner"), facilitated by
            VELORA. The vehicle will be rented for {draft.durationLabel}, from{' '}
            {formatShortDate(draft.pickupDate)} at {draft.pickupTime} to {formatShortDate(draft.dropoffDate)} at{' '}
            {draft.dropoffTime}, picked up and returned at {draft.pickupLocation || car.location}.
          </Text>

          <Text style={styles.clauseHeading}>2. Rental Mode</Text>
          <Text style={styles.clauseBody}>
            {draft.rentalMode === 'self_drive'
              ? 'This is a Self Drive rental. The Renter must hold a valid driving license and will personally operate the vehicle for the full rental period.'
              : 'This is a With Driver rental. A VELORA-verified professional driver is included and will operate the vehicle; the Renter agrees to treat the driver respectfully and cover reasonable meal breaks on multi-day trips.'}
          </Text>

          <Text style={styles.clauseHeading}>3. Vehicle Condition &amp; Damage</Text>
          <Text style={styles.clauseBody}>
            The Renter confirms they inspected the vehicle photos and specifications provided and accepts the vehicle
            "as is". The Renter is responsible for any damage, loss, or theft occurring during the rental period beyond
            normal wear and tear, and agrees to report any incident to VELORA support within 24 hours.
          </Text>

          <Text style={styles.clauseHeading}>4. Fuel &amp; Mileage Policy</Text>
          <Text style={styles.clauseBody}>
            The vehicle will be provided with a full tank and must be returned with a full tank, or a refuelling charge
            will apply.{' '}
            {/* PHASE 2 -- reads the owner's real mileagePolicy when they've
                set one, otherwise falls back to the exact same hardcoded
                300 km/day language this clause always showed, so a listing
                that hasn't configured this yet reads identically to before. */}
            {car.mileagePolicy === 'unlimited'
              ? 'This rental includes unlimited kilometers with no mileage charges.'
              : car.mileagePolicy === 'limited'
                ? `Standard usage is expected; mileage beyond ${car.kmLimitPerDay ?? 300} km/day${
                    car.extraKmCharge ? ` incurs a ${formatCurrency(car.extraKmCharge)}/km additional charge` : ' may incur additional charges'
                  }.`
                : 'Standard usage is expected; excessive mileage beyond 300 km/day may incur additional charges.'}
          </Text>

          <Text style={styles.clauseHeading}>5. Late Return &amp; Cancellation</Text>
          <Text style={styles.clauseBody}>{CANCELLATION_POLICY_TEXT}</Text>

          <Text style={styles.clauseHeading}>6. Payment</Text>
          <Text style={styles.clauseBody}>
            The Renter agrees to pay the total amount of {formatCurrency(draft.total)} (subtotal{' '}
            {formatCurrency(draft.subtotal)} + taxes {formatCurrency(draft.taxes)} + service fee{' '}
            {formatCurrency(draft.serviceFee)}
            {discount > 0 ? ` - promo discount ${formatCurrency(discount)}` : ''}) via the payment method selected on
            the next screen.
          </Text>

          <Text style={styles.clauseHeading}>7. Liability</Text>
          <Text style={styles.clauseBody}>
            VELORA acts solely as a platform connecting Renters and vehicle Owners and is not a party to the rental
            itself. Both parties agree to resolve disputes in good faith, with VELORA support mediating where needed.
          </Text>
        </View>

        <Pressable style={styles.agreeRow} onPress={() => setAgreed((a) => !a)} accessibilityLabel="Agree to the rental agreement">
          <Ionicons
            name={agreed ? 'checkbox' : 'square-outline'}
            size={22}
            color={agreed ? colors.primaryDark : colors.textTertiary}
          />
          <Text style={styles.agreeText}>
            I have read and agree to the terms of this Rental Agreement.
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Your Signature</Text>
        <InputField
          placeholder="Type your full name to sign"
          leftIcon="create-outline"
          value={signature}
          onChangeText={setSignature}
          autoCapitalize="words"
        />
        <Text style={styles.signatureNote}>
          By typing your name and continuing, you're confirming your booking under the terms above.
        </Text>
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          label={submitting ? 'Creating your booking...' : 'Sign & Continue to Payment'}
          onPress={onSign}
          disabled={!canSign || submitting}
          loading={submitting}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  carRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center', marginBottom: spacing.lg },
  carImage: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  docCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  docTitle: { ...typography.headingSm, color: colors.textPrimary },
  docMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.sm },
  clauseHeading: { ...typography.titleMd, color: colors.textPrimary, marginTop: spacing.sm },
  clauseBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  agreeText: { ...typography.bodyMd, color: colors.textPrimary, marginLeft: spacing.sm, flex: 1 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  signatureNote: { ...typography.caption, color: colors.textTertiary, marginTop: -4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
});
