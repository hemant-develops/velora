import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Chip } from '../../components/Chip';
import { RentalModeSelector } from '../../components/RentalModeSelector';
import { FallbackImage } from '../../components/FallbackImage';
import { EmptyState } from '../../components/EmptyState';
import { BookingCalendarModal } from '../../components/BookingCalendarModal';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { avatars } from '../../data/images';
import { formatCurrency, formatDate, daysBetween } from '../../utils/format';
import { applyOffer } from '../../utils/offers';
import { RentalMode } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

const TIME_SLOTS = ['09:00 AM', '12:00 PM', '03:00 PM', '06:00 PM'];
const SERVICE_FEE = 250;
const TAX_RATE = 0.1;

const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

export const BookingScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { getCarById } = useCars();
  const { getAvailableQuantity, getAccurateAvailableQuantity } = useBookings();
  const car = getCarById(route.params.carId);

  const [rentalMode, setRentalMode] = useState<RentalMode>(car?.rentalModes[0] ?? 'self_drive');
  const today = useMemo(() => new Date(), []);
  // Calendar-based date selection replaces the previous +/- day-offset
  // stepper (see BookingCalendarModal) -- the downstream contract is
  // unchanged: this screen still only ever hands pickupDate/dropoffDate
  // ISO strings to getAvailableQuantity/createBooking, exactly as before.
  const [pickupDate, setPickupDate] = useState(() => addDays(today, 1));
  const [dropoffDate, setDropoffDate] = useState(() => addDays(today, 4));
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [pickupTime, setPickupTime] = useState(TIME_SLOTS[0]);
  const [dropoffTime, setDropoffTime] = useState(TIME_SLOTS[2]);
  const [pickupLocation, setPickupLocation] = useState(car?.location ?? '');
  const [dropoffLocation, setDropoffLocation] = useState(car?.location ?? '');
  // A real, working promo code -- see utils/offers.ts. Applied to the actual
  // subtotal below and carried through into the total handed to Agreement/
  // Payment; nothing here is a cosmetic "discount" label with no effect.
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | undefined>();
  const [promoError, setPromoError] = useState<string | undefined>();

  const days = Math.max(daysBetween(pickupDate.toISOString(), dropoffDate.toISOString()), 1);
  // Fast local read (see BookingsContext.getAvailableQuantity) so this
  // updates instantly as the renter adjusts dates -- the actual atomic
  // gate against overselling runs server-side in Supabase at Pay time.
  const localEstimate = useMemo(
    () => (car ? getAvailableQuantity(car.id, pickupDate.toISOString(), dropoffDate.toISOString()) : 0),
    [car, getAvailableQuantity, pickupDate, dropoffDate],
  );
  // MULTI-DEVICE MIGRATION -- localEstimate above only knows about bookings
  // THIS device's RLS session can see (this renter's own, or -- if they're
  // the owner -- every booking on their own car), so it can under-count
  // units another renter has already taken on a car you don't own. Shown
  // immediately for instant feedback, then corrected a moment later by the
  // accurate, privacy-safe get_car_taken_count RPC (see BookingsContext).
  // The real safety net against overselling stays server-side either way --
  // this only changes what NUMBER the renter sees before they get there.
  const [availableQuantity, setAvailableQuantity] = useState(localEstimate);
  useEffect(() => {
    setAvailableQuantity(localEstimate);
    if (!car) return;
    let cancelled = false;
    getAccurateAvailableQuantity(car.id, pickupDate.toISOString(), dropoffDate.toISOString()).then((accurate) => {
      if (!cancelled) setAvailableQuantity(accurate);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car, pickupDate, dropoffDate, localEstimate]);

  const onApplyDates = (nextPickup: Date, nextDropoff: Date) => {
    setPickupDate(nextPickup);
    setDropoffDate(nextDropoff);
    setCalendarVisible(false);
  };

  if (!car) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Unable to load booking" subtitle="This listing may no longer be available." />
      </View>
    );
  }

  const activePrice = rentalMode === 'self_drive' ? car.pricePerDay : car.driverPricePerDay;
  const subtotal = activePrice * days;
  const taxes = Math.round(subtotal * TAX_RATE);
  const promoResult = appliedPromoCode ? applyOffer(appliedPromoCode, subtotal) : undefined;
  const discount = promoResult?.success ? promoResult.discount : 0;
  const total = subtotal + taxes + SERVICE_FEE - discount;

  const onApplyPromo = () => {
    const result = applyOffer(promoInput, subtotal);
    if (!result.success) {
      setPromoError(result.error);
      setAppliedPromoCode(undefined);
      return;
    }
    setAppliedPromoCode(promoInput.trim().toUpperCase());
    setPromoError(undefined);
  };

  const onRemovePromo = () => {
    setAppliedPromoCode(undefined);
    setPromoInput('');
    setPromoError(undefined);
  };

  const onContinue = () => {
    navigation.navigate('Agreement', {
      carId: car.id,
      rentalMode,
      pickupLocation,
      dropoffLocation,
      pickupDate: pickupDate.toISOString(),
      dropoffDate: dropoffDate.toISOString(),
      pickupTime,
      dropoffTime,
      days,
      subtotal,
      taxes,
      serviceFee: SERVICE_FEE,
      total,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Booking Details" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.carRow, shadows.sm]}>
          <FallbackImage uri={car.images[0]} style={styles.carImage} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.carMeta}>{car.category}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How would you like to rent?</Text>
        <RentalModeSelector
          value={rentalMode}
          onChange={setRentalMode}
          selfDrivePrice={car.pricePerDay}
          withDriverPrice={car.driverPricePerDay}
          availableModes={car.rentalModes}
        />

        {rentalMode === 'with_driver' ? (
          <View style={styles.driverCard}>
            <Image source={{ uri: avatars.driver }} style={styles.driverAvatar} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={typography.titleMd}>Professional Verified Driver</Text>
              <Text style={styles.driverCaption}>Included · up to 8 hours/day · fluent in English</Text>
            </View>
            <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Pickup &amp; Drop-off</Text>
        <InputField label="Pickup Location" leftIcon="location-outline" value={pickupLocation} onChangeText={setPickupLocation} />
        <InputField label="Drop-off Location" leftIcon="location-outline" value={dropoffLocation} onChangeText={setDropoffLocation} />

        <Pressable
          style={[styles.dateSelectCard, shadows.sm]}
          onPress={() => setCalendarVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Select pickup and drop-off dates"
        >
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Pickup Date</Text>
            <Text style={styles.dateValue}>{formatDate(pickupDate.toISOString())}</Text>
          </View>
          <View style={styles.dateDivider} />
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Drop-off Date</Text>
            <Text style={styles.dateValue}>{formatDate(dropoffDate.toISOString())}</Text>
          </View>
          <View style={styles.calendarIconWrap}>
            <Ionicons name="calendar-outline" size={18} color={colors.textPrimary} />
          </View>
        </Pressable>

        <BookingCalendarModal
          visible={calendarVisible}
          pickupDate={pickupDate}
          dropoffDate={dropoffDate}
          onClose={() => setCalendarVisible(false)}
          onApply={onApplyDates}
        />

        {/* B3.5 -- a third, "low stock" tier using the exact same real
            availableQuantity this row already computes (instant local
            estimate, corrected a moment later by the accurate server count
            -- see the useEffect above) -- no fabricated countdown or fake
            urgency, just a clearer visual read of a number that was already
            being shown. Threshold of 2 matches common "few left" marketplace
            conventions without overstating it for listings that simply have
            a small total quantity. */}
        <View
          style={[
            styles.availabilityRow,
            availableQuantity === 0
              ? styles.availabilityRowNone
              : availableQuantity <= 2
                ? styles.availabilityRowLow
                : undefined,
          ]}
        >
          <Ionicons
            name={availableQuantity === 0 ? 'close-circle' : availableQuantity <= 2 ? 'alert-circle' : 'checkmark-circle'}
            size={16}
            color={availableQuantity === 0 ? colors.danger : availableQuantity <= 2 ? colors.warning : colors.success}
          />
          <Text
            style={[
              styles.availabilityText,
              availableQuantity === 0
                ? styles.availabilityTextNone
                : availableQuantity <= 2
                  ? styles.availabilityTextLow
                  : undefined,
            ]}
          >
            {availableQuantity === 0
              ? 'No cars available for these dates'
              : availableQuantity <= 2
                ? `Only ${availableQuantity} car${availableQuantity === 1 ? '' : 's'} left for these dates`
                : `${availableQuantity} cars available for these dates`}
          </Text>
        </View>

        <Text style={styles.timeLabel}>Pickup Time</Text>
        <View style={styles.chipRow}>
          {TIME_SLOTS.map((slot) => (
            <Chip key={`pu-${slot}`} label={slot} selected={pickupTime === slot} onPress={() => setPickupTime(slot)} />
          ))}
        </View>

        <Text style={[styles.timeLabel, { marginTop: spacing.sm }]}>Drop-off Time</Text>
        <View style={styles.chipRow}>
          {TIME_SLOTS.map((slot) => (
            <Chip key={`do-${slot}`} label={slot} selected={dropoffTime === slot} onPress={() => setDropoffTime(slot)} />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Promo Code</Text>
        {appliedPromoCode ? (
          <View style={styles.promoAppliedRow}>
            <Ionicons name="pricetag" size={16} color={colors.success} />
            <Text style={styles.promoAppliedText}>
              {appliedPromoCode} applied — you saved {formatCurrency(discount)}
            </Text>
            <Pressable onPress={onRemovePromo} hitSlop={8}>
              <Text style={styles.promoRemoveText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.promoRow}>
            <InputField
              placeholder="Enter promo code"
              leftIcon="pricetag-outline"
              autoCapitalize="characters"
              value={promoInput}
              onChangeText={(text) => {
                setPromoInput(text);
                setPromoError(undefined);
              }}
              style={{ flex: 1 }}
            />
            <Pressable
              style={[styles.promoApplyBtn, !promoInput.trim() ? styles.promoApplyBtnDisabled : undefined]}
              onPress={onApplyPromo}
              disabled={!promoInput.trim()}
            >
              <Text style={styles.promoApplyBtnText}>Apply</Text>
            </Pressable>
          </View>
        )}
        {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}

        <Text style={styles.sectionTitle}>Price Details</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {formatCurrency(activePrice)} x {days} day{days === 1 ? '' : 's'}
            </Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Taxes</Text>
            <Text style={styles.summaryValue}>{formatCurrency(taxes)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service fee</Text>
            <Text style={styles.summaryValue}>{formatCurrency(SERVICE_FEE)}</Text>
          </View>
          {discount > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.success }]}>Promo discount</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>-{formatCurrency(discount)}</Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatCurrency(total)}</Text>
        </View>
        <PrimaryButton
          label="Review Agreement"
          onPress={onContinue}
          disabled={availableQuantity === 0}
          fullWidth={false}
          style={{ paddingHorizontal: spacing.xl }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  carRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center' },
  carImage: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card },
  driverCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  dateSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  dateCol: { flex: 1 },
  dateDivider: { width: 1, height: 34, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  dateLabel: { ...typography.bodySm, color: colors.textSecondary, marginBottom: 4 },
  timeLabel: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  calendarIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  dateValue: { ...typography.titleLg, color: colors.textPrimary },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  availabilityRowNone: { backgroundColor: colors.dangerBg },
  availabilityRowLow: { backgroundColor: colors.warningBg },
  availabilityText: { ...typography.bodySm, color: colors.success, marginLeft: 6, fontWeight: '600' },
  availabilityTextNone: { color: colors.danger },
  availabilityTextLow: { color: colors.warning },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  promoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  promoApplyBtn: {
    backgroundColor: colors.onPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  promoApplyBtnDisabled: { opacity: 0.4 },
  promoApplyBtnText: { ...typography.titleMd, color: colors.white },
  promoErrorText: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  promoAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  promoAppliedText: { ...typography.bodySm, color: colors.success, marginLeft: 8, flex: 1, fontWeight: '600' },
  promoRemoveText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '700' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { ...typography.bodyMd, color: colors.textSecondary },
  summaryValue: { ...typography.titleMd, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { ...typography.titleLg, color: colors.textPrimary },
  totalValue: { ...typography.headingSm, color: colors.textPrimary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  footerLabel: { ...typography.bodySm, color: colors.textSecondary },
  footerTotal: { ...typography.headingMd, color: colors.textPrimary },
});
