import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { PrimaryButton } from './PrimaryButton';

interface Props {
  visible: boolean;
  pickupDate: Date;
  dropoffDate: Date;
  onClose: () => void;
  onApply: (pickup: Date, dropoff: Date) => void;
  // PHASE 1 -- 'single' picks ONE date (a tap immediately selects it and
  // enables Apply), used by BookingScreen's new hours-first flow where only
  // a pickup date is chosen and drop-off is derived from duration. Omitted/
  // 'range' keeps the exact original two-tap range-selection behavior used
  // nowhere else today, so no existing call site is affected.
  mode?: 'range' | 'single';
  title?: string;
}

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

// Builds a fixed 6-row (42-cell) month grid, with the leading/trailing cells
// from the adjacent months included (but not rendered as pressable) so the
// grid never reflows in height between months -- a small but real part of
// "avoid layout jumping" applied to the calendar itself, not just skeletons.
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

const formatHeaderDate = (d: Date | null): string =>
  d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Select a date';

// Production-grade calendar for choosing a pickup/drop-off date range,
// replacing the previous +/- day-offset stepper. Two-tap range selection
// (tap a start date, then an end date) is the same pattern renters already
// know from most booking apps. This component ONLY produces two Date
// objects on Apply -- it knows nothing about availability, pricing, or the
// booking RPC; BookingScreen still owns exactly the same
// getAvailableQuantity/createBooking contract as before (see its own
// comments), just fed by this picker instead of the stepper.
export const BookingCalendarModal: React.FC<Props> = ({
  visible,
  pickupDate,
  dropoffDate,
  onClose,
  onApply,
  mode = 'range',
  title,
}) => {
  const insets = useSafeAreaInsets();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(pickupDate));
  const [selPickup, setSelPickup] = useState<Date | null>(pickupDate);
  const [selDropoff, setSelDropoff] = useState<Date | null>(dropoffDate);

  // Re-seed from the current booking state every time the modal opens, so
  // reopening it always reflects whatever is actually selected on
  // BookingScreen right now (including after a Clear + close without Apply).
  useEffect(() => {
    if (visible) {
      setSelPickup(pickupDate);
      setSelDropoff(dropoffDate);
      setVisibleMonth(startOfMonth(pickupDate));
    }
  }, [visible, pickupDate, dropoffDate]);

  // Compared as a single "months since epoch" integer rather than year/month
  // separately -- comparing the two fields independently (OR'd together)
  // gives the wrong answer across a year boundary (e.g. Dec vs. a later
  // Jan), so they're combined into one comparable number instead.
  const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const canGoPrevMonth = monthIndex(visibleMonth) > monthIndex(today);

  const onDayPress = (day: Date) => {
    if (day < today) return; // past dates prevented
    if (mode === 'single') {
      // One tap = one date, applied to both pickup/dropoff so the existing
      // two-Date onApply contract needs no change -- the caller (in single
      // mode) only ever reads the first Date it gets back.
      setSelPickup(day);
      setSelDropoff(day);
      return;
    }
    if (!selPickup || selDropoff) {
      // Nothing selected yet, or a full range already exists -- start over.
      setSelPickup(day);
      setSelDropoff(null);
      return;
    }
    // selPickup is set, selDropoff is not -- this tap chooses the drop-off,
    // UNLESS it would put drop-off at or before pickup (pickup can never
    // incorrectly exceed drop-off), in which case treat it as re-picking a
    // new pickup date instead of silently rejecting the tap.
    if (day.getTime() <= selPickup.getTime()) {
      setSelPickup(day);
      setSelDropoff(null);
      return;
    }
    setSelDropoff(day);
  };

  const onClear = () => {
    setSelPickup(null);
    setSelDropoff(null);
  };

  const goPrevMonth = () => {
    if (!canGoPrevMonth) return;
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const goNextMonth = () => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const onApplyPress = () => {
    if (!selPickup || !selDropoff) return;
    onApply(selPickup, selDropoff);
  };

  const grid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const phaseLabel = !selPickup ? 'Select your pickup date' : !selDropoff ? 'Select your drop-off date' : 'Dates selected';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.headerRow}>
            <Text style={typography.headingSm}>{title ?? (mode === 'single' ? 'Select Date' : 'Select Dates')}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close calendar">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {mode === 'single' ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{formatHeaderDate(selPickup)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Pickup</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{formatHeaderDate(selPickup)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Drop-off</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{formatHeaderDate(selDropoff)}</Text>
              </View>
            </View>
          )}
          <Text style={styles.phaseLabel}>{mode === 'single' ? 'Select a date' : phaseLabel}</Text>

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
              const disabled = day < today;
              const isPickup = !!selPickup && isSameDay(day, selPickup);
              const isDropoff = !!selDropoff && isSameDay(day, selDropoff);
              const inRange = !!selPickup && !!selDropoff && day > selPickup && day < selDropoff;
              const isToday = isSameDay(day, today);
              return (
                <Pressable
                  key={idx}
                  onPress={() => onDayPress(day)}
                  disabled={disabled}
                  style={styles.dayCell}
                  accessibilityLabel={day.toDateString()}
                  accessibilityState={{ disabled, selected: isPickup || isDropoff }}
                >
                  <View
                    style={[
                      styles.dayInner,
                      inRange ? styles.dayInRange : undefined,
                      isPickup ? styles.dayRangeEdgeLeft : undefined,
                      isDropoff ? styles.dayRangeEdgeRight : undefined,
                    ]}
                  >
                    <View
                      style={[
                        styles.dayCircle,
                        (isPickup || isDropoff) ? styles.daySelectedCircle : undefined,
                        isToday && !isPickup && !isDropoff ? styles.dayTodayCircle : undefined,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          disabled ? styles.dayTextDisabled : undefined,
                          (isPickup || isDropoff) ? styles.dayTextSelected : undefined,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footerRow}>
            <Pressable onPress={onClear} hitSlop={8} style={styles.clearBtn}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
            <PrimaryButton
              label="Apply Dates"
              onPress={onApplyPress}
              disabled={!selPickup || !selDropoff}
              fullWidth={false}
              style={{ flex: 1, marginLeft: spacing.md }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const CELL = '14.28%' as const;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryLabel: { ...typography.caption, color: colors.textTertiary },
  summaryValue: { ...typography.titleMd, color: colors.textPrimary, marginTop: 2 },
  phaseLabel: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xs },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.sm },
  monthNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { ...typography.titleLg, color: colors.textPrimary },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: CELL, textAlign: 'center', ...typography.caption, color: colors.textTertiary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayInner: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  dayInRange: { backgroundColor: colors.surface },
  dayRangeEdgeLeft: { backgroundColor: colors.surface, borderTopLeftRadius: radii.pill, borderBottomLeftRadius: radii.pill },
  dayRangeEdgeRight: { backgroundColor: colors.surface, borderTopRightRadius: radii.pill, borderBottomRightRadius: radii.pill },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySelectedCircle: { backgroundColor: colors.primary },
  dayTodayCircle: { borderWidth: 1.5, borderColor: colors.primaryDark },
  dayText: { ...typography.bodyMd, color: colors.textPrimary },
  dayTextDisabled: { color: colors.textTertiary },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  clearBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  clearText: { ...typography.titleMd, color: colors.textSecondary },
});
