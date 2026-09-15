// PHASE 3 -- Owner Car Calendar (availability visualization).
// PHASE 6 -- Block Car: an empty (no-booking) day can now be tapped to
// toggle it blocked/unblocked -- see src/utils/blockedDates.ts and
// 0008_car_blocked_dates.sql. A day WITH a booking is still shown exactly as
// before and can never be blocked (a real reservation always wins).
//
// Shows, for ONE of the owner's own cars, which calendar days already have
// a pending/upcoming/active booking against this car's quantity, and which
// days the owner has manually blocked off -- so an owner can see at a
// glance which dates are open, partially taken, fully booked, or blocked,
// without digging through the Bookings list. Still NOT the availability
// gate the booking flow's actual hold uses (that remains
// create_local_car_booking_hold / get_car_taken_count, both server-side and
// completely untouched by this screen -- see BookingsContext); the blocked-
// dates check that DOES gate booking creation lives in
// BookingsContext.createBooking as a separate, advisory check on top of
// that RPC -- see that function's own comment.
//
// The month-grid building logic below is intentionally a SEPARATE copy of
// BookingCalendarModal's (not imported/shared) -- that component is a
// working, tested date-RANGE PICKER with its own two-tap selection state
// machine; bolting this screen's read/toggle "mark busy days" mode onto it
// risked regressing the booking flow for a feature that doesn't pick dates
// at all. Duplicating ~20 lines of pure grid math here is the lower-risk
// trade-off.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { getCarQuantity } from '../../utils/inventory';
import { dateRangesOverlap, toLocalDateOnly } from '../../utils/dateRange';
import { formatShortDate } from '../../utils/format';
import { showToast } from '../../utils/toast';
import { fetchBlockedDates, blockDate, unblockDate } from '../../utils/blockedDates';
import { Booking } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerCarCalendar'>;

// Mirrors BookingsContext's own (private) BLOCKING_STATUSES -- these are
// the statuses that actually occupy a unit of this car for a date. Kept in
// sync by hand since that constant isn't exported; if it ever changes there,
// change it here too.
const BLOCKING_STATUSES: Booking['status'][] = ['pending', 'upcoming', 'active'];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (d: Date): Date => {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

const buildMonthGrid = (monthStart: Date): (Date | null)[] => {
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
};

export const OwnerCarCalendarScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { getCarById } = useCars();
  const { getBookingsForCars } = useBookings();
  const car = getCarById(route.params.carId);

  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(today));
  // PHASE 6 -- 'YYYY-MM-DD' keys, matching toLocalDateOnly's format exactly
  // so a Set membership check below never mismatches on formatting.
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!car) return;
    let cancelled = false;
    fetchBlockedDates(car.id).then((result) => {
      if (!cancelled) setBlockedDates(new Set(result.dates));
    });
    return () => {
      cancelled = true;
    };
  }, [car?.id]);

  const carBookings = useMemo(
    () =>
      car
        ? getBookingsForCars([car.id])
            .filter((b) => BLOCKING_STATUSES.includes(b.status))
            .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime())
        : [],
    [car, getBookingsForCars],
  );

  if (!car) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="calendar-outline" title="Unable to load this car" />
      </View>
    );
  }

  const quantity = getCarQuantity(car);

  // How many blocking bookings cover this specific calendar day.
  const bookedCountFor = (day: Date): Booking[] => {
    const iso = day.toISOString();
    return carBookings.filter((b) => dateRangesOverlap(b.pickupDate, b.dropoffDate, iso, iso));
  };

  const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const canGoPrevMonth = monthIndex(visibleMonth) > monthIndex(today);
  const goPrevMonth = () => {
    if (!canGoPrevMonth) return;
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const goNextMonth = () => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  // PHASE 6 -- keeps the exact same Date -> ISO -> local-day round trip this
  // file already uses for bookedCountFor's `iso` below, so a blocked-date
  // key can never drift from how a booking's overlap is matched against the
  // same calendar cell.
  const dayKey = (day: Date): string => toLocalDateOnly(day.toISOString());

  const onToggleBlocked = async (day: Date) => {
    if (!car) return;
    const key = dayKey(day);
    const wasBlocked = blockedDates.has(key);
    // Optimistic -- matches this app's other toggle actions (e.g. Active/
    // Inactive on OwnerDashboardScreen).
    setBlockedDates((prev) => {
      const next = new Set(prev);
      if (wasBlocked) next.delete(key);
      else next.add(key);
      return next;
    });
    const result = wasBlocked ? await unblockDate(car.id, key) : await blockDate(car.id, key);
    if (result.error) {
      // Roll back on failure.
      setBlockedDates((prev) => {
        const next = new Set(prev);
        if (wasBlocked) next.add(key);
        else next.delete(key);
        return next;
      });
      showToast("Couldn't update this date — check your connection and try again.");
    }
  };

  const onDayPress = (day: Date, dayBookings: Booking[]) => {
    if (dayBookings.length > 0) {
      const lines = dayBookings.map(
        (b) => `${b.renterName ?? 'Customer'} · ${formatShortDate(b.pickupDate)} - ${formatShortDate(b.dropoffDate)} · ${b.status}`,
      );
      Alert.alert(day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), lines.join('\n'));
      return;
    }
    // PHASE 6 -- an open day (no booking) can be blocked/unblocked. Past
    // days are left alone entirely -- there's nothing to protect by
    // blocking a date that's already gone.
    if (day < today) return;
    const label = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const isBlocked = blockedDates.has(dayKey(day));
    if (isBlocked) {
      Alert.alert(label, 'This date is blocked and hidden from renters. Unblock it so it can be booked again?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => onToggleBlocked(day) },
      ]);
    } else {
      Alert.alert(label, "Block this date so renters can't book it? You can unblock it again anytime.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', onPress: () => onToggleBlocked(day) },
      ]);
    }
  };

  const grid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={car.name} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <Text style={styles.screenSubtitle}>Availability Calendar</Text>
        {car.bufferHours ? (
          <View style={styles.bufferBanner}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.bufferBannerText}>
              You've noted {car.bufferHours}h needed between bookings for cleaning/prep — this isn't automatically
              blocked, just a reminder when reviewing requests near an existing booking.
            </Text>
          </View>
        ) : null}

        <View style={styles.monthNavRow}>
          <Pressable onPress={goPrevMonth} disabled={!canGoPrevMonth} hitSlop={8} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={20} color={canGoPrevMonth ? colors.textPrimary : colors.textTertiary} />
          </Pressable>
          <Text style={styles.monthLabel}>{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</Text>
          <Pressable onPress={goNextMonth} hitSlop={8} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={`${label}-${i}`} style={styles.weekdayLabel}>{label}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {grid.map((day, idx) => {
            if (!day) return <View key={idx} style={styles.dayCell} />;
            const dayBookings = bookedCountFor(day);
            const bookedCount = dayBookings.length;
            const isFull = bookedCount >= quantity;
            const isPartial = bookedCount > 0 && !isFull;
            // PHASE 6 -- a booking always takes visual priority over a
            // blocked mark (bookedCount is only ever > 0 for a real
            // reservation, which can't coexist with a block on the same day
            // -- blocking is only offered on an empty day in the first
            // place, see onDayPress above).
            const isBlocked = bookedCount === 0 && blockedDates.has(dayKey(day));
            const isToday = isSameDay(day, today);
            return (
              <Pressable
                key={idx}
                onPress={() => onDayPress(day, dayBookings)}
                style={styles.dayCell}
                accessibilityLabel={`${day.toDateString()}${bookedCount > 0 ? `, ${bookedCount} booking${bookedCount === 1 ? '' : 's'}` : isBlocked ? ', blocked' : ', available'}`}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isFull ? styles.dayFull : isPartial ? styles.dayPartial : isBlocked ? styles.dayBlocked : undefined,
                    isToday ? styles.dayToday : undefined,
                  ]}
                >
                  <Text style={[styles.dayText, isFull || isBlocked ? styles.dayTextOnColor : undefined]}>{day.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotPartial]} />
            <Text style={styles.legendText}>Partially booked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotFull]} />
            <Text style={styles.legendText}>Fully booked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotBlocked]} />
            <Text style={styles.legendText}>Blocked by you</Text>
          </View>
        </View>
        <Text style={styles.legendHint}>Tap a booked date to see who's booked it. Tap an open date to block or unblock it.</Text>

        {carBookings.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No upcoming bookings" subtitle="This car is fully open right now." />
        ) : null}
      </ScrollView>
    </View>
  );
};

const CELL = '14.28%' as const;

const styles = StyleSheet.create({
  screenSubtitle: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.md },
  bufferBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  bufferBannerText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 8, flex: 1, lineHeight: 18 },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { ...typography.titleLg, color: colors.textPrimary },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: CELL, textAlign: 'center', ...typography.caption, color: colors.textTertiary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayPartial: { backgroundColor: colors.warningBg },
  dayFull: { backgroundColor: colors.danger },
  dayBlocked: { backgroundColor: colors.textTertiary },
  dayToday: { borderWidth: 1.5, borderColor: colors.primaryDark },
  dayText: { ...typography.bodyMd, color: colors.textPrimary },
  dayTextOnColor: { color: colors.white, fontWeight: '700' },
  legendRow: { flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.md },
  legendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, marginRight: 6 },
  legendDotPartial: { backgroundColor: colors.warningBg },
  legendDotFull: { backgroundColor: colors.danger },
  legendDotBlocked: { backgroundColor: colors.textTertiary },
  legendText: { ...typography.caption, color: colors.textSecondary },
  legendHint: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md },
});
