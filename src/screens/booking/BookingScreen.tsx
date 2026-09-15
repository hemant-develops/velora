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
import { RentalModeSelector } from '../../components/RentalModeSelector';
import { FallbackImage } from '../../components/FallbackImage';
import { EmptyState } from '../../components/EmptyState';
import { BookingCalendarModal } from '../../components/BookingCalendarModal';
import { TimePickerModal } from '../../components/TimePickerModal';
import { DurationSelector } from '../../components/DurationSelector';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { avatars } from '../../data/images';
import { formatCurrency, formatDate, formatTime12h } from '../../utils/format';
import { applyOffer } from '../../utils/offers';
import {
  DEFAULT_DURATION_HOURS,
  DURATION_PRESETS_HOURS,
  MIN_DURATION_HOURS,
  computeDropoff,
  durationHoursToBillableDays,
  formatDurationHours,
  isValidDurationHours,
} from '../../utils/duration';
import { priceForDuration } from '../../utils/pricing';
import { RentalMode } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

const SERVICE_FEE = 250;
const TAX_RATE = 0.1;
// Sensible default pickup time -- matches the spec's own worked example
// ("Pickup: 15 Sep 2026, 10:00 AM"). Applied only to the DEFAULT pickup
// Date's hours/minutes; the renter can change it via the full clock picker.
const DEFAULT_PICKUP_HOUR = 10;

const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const withTime = (date: Date, hour24: number, minute: number): Date => {
  const d = new Date(date);
  d.setHours(hour24, minute, 0, 0);
  return d;
};

export const BookingScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { getCarById } = useCars();
  const { getAvailableQuantity, getAccurateAvailableQuantity } = useBookings();
  const car = getCarById(route.params.carId);

  const [rentalMode, setRentalMode] = useState<RentalMode>(car?.rentalModes[0] ?? 'self_drive');

  // PHASE 2 -- which duration chips this specific car offers (see
  // Car.enabledDurationPresets). Falls back to all four presets for any car
  // without the field set, matching exactly what every car offered in
  // Phase 1. Cheap to recompute each render -- no hook needed.
  const enabledPresets: readonly number[] =
    car?.enabledDurationPresets && car.enabledDurationPresets.length > 0
      ? car.enabledDurationPresets
      : DURATION_PRESETS_HOURS;

  // PHASE 1 -- hours-first booking duration model. `pickupDateTime` is a
  // single, precise instant (calendar date picker sets the day, the clock
  // picker below sets the hour/minute on that SAME Date object). Drop-off is
  // never independently chosen -- it is always pickup + the selected
  // duration, computed with real epoch-ms arithmetic (see utils/duration.ts
  // computeDropoff), which is what makes it immune to timezone/midnight-
  // rollover bugs the old "+1 calendar day" stepper was exposed to.
  const today = useMemo(() => new Date(), []);
  const [pickupDateTime, setPickupDateTime] = useState(() => withTime(addDays(today, 1), DEFAULT_PICKUP_HOUR, 0));
  // PHASE 2 -- defaults to the standard 24h preset when this car offers it
  // (unchanged from Phase 1), otherwise falls back to whichever preset the
  // owner DOES offer, so the initial selection is never a chip that isn't
  // actually rendered.
  const [durationPreset, setDurationPreset] = useState<number | 'custom'>(
    enabledPresets.includes(DEFAULT_DURATION_HOURS) ? DEFAULT_DURATION_HOURS : (enabledPresets[0] ?? DEFAULT_DURATION_HOURS),
  );
  const [customDurationHours, setCustomDurationHours] = useState<number | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickupLocation, setPickupLocation] = useState(car?.location ?? '');
  const [dropoffLocation, setDropoffLocation] = useState(car?.location ?? '');
  // A real, working promo code -- see utils/offers.ts. Applied to the actual
  // subtotal below and carried through into the total handed to Agreement/
  // Payment; nothing here is a cosmetic "discount" label with no effect.
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | undefined>();
  const [promoError, setPromoError] = useState<string | undefined>();

  // The duration actually in effect right now. While Custom is selected but
  // the renter hasn't typed a (valid) value yet, this falls back to the
  // minimum purely so dropoff/price always have something sane to display --
  // the Continue button stays disabled until customDurationHours itself is
  // valid (see durationValid below), so this fallback can never be silently
  // booked.
  const effectiveDurationHours =
    durationPreset === 'custom' ? (customDurationHours ?? MIN_DURATION_HOURS) : durationPreset;
  const durationValid = durationPreset !== 'custom' || isValidDurationHours(customDurationHours ?? 0);
  const durationLabel = formatDurationHours(effectiveDurationHours);

  const dropoffDateTime = useMemo(
    () => computeDropoff(pickupDateTime, effectiveDurationHours),
    [pickupDateTime, effectiveDurationHours],
  );

  // Existing per-day price architecture is preserved exactly (Phase 2 is
  // where real duration-based owner pricing replaces this) -- only WHAT
  // feeds `days` has changed, from a calendar-day difference to a duration-
  // derived billable-day count. See durationHoursToBillableDays' own comment.
  const days = durationHoursToBillableDays(effectiveDurationHours);

  // Fast local read (see BookingsContext.getAvailableQuantity) so this
  // updates instantly as the renter adjusts date/duration -- the actual
  // atomic gate against overselling runs server-side in Supabase at
  // booking-creation time, completely unchanged (day-granularity hold RPC --
  // see BookingsContext.createBooking, which this screen never touches
  // directly).
  const localEstimate = useMemo(
    () => (car ? getAvailableQuantity(car.id, pickupDateTime.toISOString(), dropoffDateTime.toISOString()) : 0),
    [car, getAvailableQuantity, pickupDateTime, dropoffDateTime],
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
    getAccurateAvailableQuantity(car.id, pickupDateTime.toISOString(), dropoffDateTime.toISOString()).then((accurate) => {
      if (!cancelled) setAvailableQuantity(accurate);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car, pickupDateTime, dropoffDateTime, localEstimate]);

  const onApplyPickupDate = (nextDay: Date) => {
    // Keep the existing hour/minute, only the calendar day changes.
    setPickupDateTime((prev) => withTime(nextDay, prev.getHours(), prev.getMinutes()));
    setDatePickerVisible(false);
  };

  const onApplyPickupTime = (hour24: number, minute: number) => {
    setPickupDateTime((prev) => withTime(prev, hour24, minute));
    setTimePickerVisible(false);
  };

  if (!car) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Unable to load booking" subtitle="This listing may no longer be available." />
      </View>
    );
  }

  // PHASE 2 -- real duration-based owner pricing (see utils/pricing.ts).
  // Falls back to the exact Phase 1 flat-price formula for any car without
  // owner-set duration pricing, so nothing changes for existing listings.
  const subtotal = priceForDuration(car, rentalMode, effectiveDurationHours);
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
    if (!durationValid) return;
    navigation.navigate('Agreement', {
      carId: car.id,
      rentalMode,
      pickupLocation,
      dropoffLocation,
      pickupDate: pickupDateTime.toISOString(),
      dropoffDate: dropoffDateTime.toISOString(),
      pickupTime: formatTime12h(pickupDateTime),
      dropoffTime: formatTime12h(dropoffDateTime),
      days,
      durationHours: effectiveDurationHours,
      durationLabel,
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

        <Text style={styles.timeLabel}>Pickup</Text>
        <View style={styles.pickupRow}>
          <Pressable
            style={[styles.dateTimeCard, shadows.sm, { flex: 1.3, marginRight: spacing.xs }]}
            onPress={() => setDatePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Select pickup date"
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.dateTimeValue} numberOfLines={1}>{formatDate(pickupDateTime.toISOString())}</Text>
          </Pressable>
          <Pressable
            style={[styles.dateTimeCard, shadows.sm, { flex: 1 }]}
            onPress={() => setTimePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Select pickup time"
          >
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.dateTimeValue} numberOfLines={1}>{formatTime12h(pickupDateTime)}</Text>
          </Pressable>
        </View>

        <BookingCalendarModal
          visible={datePickerVisible}
          pickupDate={pickupDateTime}
          dropoffDate={pickupDateTime}
          mode="single"
          title="Select Pickup Date"
          onClose={() => setDatePickerVisible(false)}
          onApply={onApplyPickupDate}
        />
        <TimePickerModal
          visible={timePickerVisible}
          title="Select Pickup Time"
          value={pickupDateTime}
          onClose={() => setTimePickerVisible(false)}
          onSelect={onApplyPickupTime}
        />

        <Text style={[styles.timeLabel, { marginTop: spacing.lg }]}>Rental Duration</Text>
        <DurationSelector
          selectedPreset={durationPreset}
          customHours={customDurationHours}
          onSelectPreset={(hours) => setDurationPreset(hours)}
          onSelectCustom={() => setDurationPreset('custom')}
          onChangeCustomHours={setCustomDurationHours}
          presets={enabledPresets}
        />

        <View style={[styles.dropoffCard, shadows.sm]}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Drop-off</Text>
            <Text style={styles.dateValue}>
              {durationValid ? `${formatDate(dropoffDateTime.toISOString())} · ${formatTime12h(dropoffDateTime)}` : '—'}
            </Text>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>{durationLabel}</Text>
          </View>
        </View>

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

        {/* PHASE 2 -- mileage policy visibility parity: the renter sees the
            exact same limited/unlimited KM policy the owner configured (or,
            if unset, the existing 300 km/day default text also shown in the
            Rental Agreement's Fuel & Mileage clause), before they ever
            commit to booking. */}
        <View style={styles.mileageRow}>
          <Ionicons name="speedometer-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.mileageText}>
            {car.mileagePolicy === 'unlimited'
              ? 'Unlimited KM included'
              : car.mileagePolicy === 'limited'
                ? `${car.kmLimitPerDay ?? 300} km/day included${car.extraKmCharge ? ` · ${formatCurrency(car.extraKmCharge)}/km after that` : ''}`
                : '300 km/day included'}
          </Text>
        </View>

        {/* PHASE 6 -- Instant Book. Sets the right expectation before the
            renter commits: an instant-book car confirms immediately, a
            regular one still needs the owner's confirmation first (see
            BookingsContext.createBooking). */}
        <View style={styles.mileageRow}>
          <Ionicons name={car.instantBook ? 'flash' : 'time-outline'} size={16} color={car.instantBook ? colors.success : colors.textSecondary} />
          <Text style={[styles.mileageText, car.instantBook ? { color: colors.success } : undefined]}>
            {car.instantBook
              ? 'Instant Book — confirmed immediately, no approval wait'
              : 'Request to Book — the owner needs to confirm before it’s final'}
          </Text>
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
            {/* PHASE 2 -- "activePrice x days" was only ever a correct
                description of the legacy flat-price formula; with owner-set
                duration pricing, subtotal no longer decomposes that way, so
                this now labels the rental by its actual duration instead,
                which is accurate under either pricing source. */}
            <Text style={styles.summaryLabel}>Rental price ({durationLabel})</Text>
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
          disabled={availableQuantity === 0 || !durationValid}
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
  timeLabel: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  pickupRow: { flexDirection: 'row' },
  dateTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dateTimeValue: { ...typography.titleMd, color: colors.textPrimary, marginLeft: spacing.xs, flexShrink: 1 },
  dropoffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  dateCol: { flex: 1 },
  dateLabel: { ...typography.bodySm, color: colors.textSecondary, marginBottom: 4 },
  dateValue: { ...typography.titleLg, color: colors.textPrimary },
  durationBadge: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  durationBadgeText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700' },
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
  mileageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  mileageText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 6, fontWeight: '600' },
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
