import React, { useMemo, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface TimeSlot {
  hour24: number; // 0-23, for building the actual Date
  minute: number; // 0 or 30
  label: string; // "10:00 AM"
}

// Every half-hour of a 12-hour AM/PM clock, in order from 12:00 AM to
// 11:30 PM -- the exact list the spec's own example enumerates ("12:00 AM,
// 12:30 AM, 1:00 AM, 1:30 AM ... 11:30 PM"). Built once at module load, not
// per-render.
const SLOTS: TimeSlot[] = (() => {
  const out: TimeSlot[] = [];
  for (let hour24 = 0; hour24 < 24; hour24 += 1) {
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const period = hour24 < 12 ? 'AM' : 'PM';
    for (const minute of [0, 30]) {
      out.push({ hour24, minute, label: `${hour12}:${String(minute).padStart(2, '0')} ${period}` });
    }
  }
  return out;
})();

interface Props {
  visible: boolean;
  title: string;
  // The currently-selected time, used only to pre-highlight/scroll to the
  // matching slot -- the calendar DATE this time gets applied to is owned
  // entirely by the caller (see BookingScreen), never this component.
  value: Date;
  onClose: () => void;
  onSelect: (hour24: number, minute: number) => void;
}

// A full 12-hour AM/PM clock picker -- every half-hour from 12:00 AM to
// 11:30 PM, always showing AM/PM explicitly (never a bare 24-hour number),
// replacing the previous fixed 4-option time chip row. Internally still
// stores/returns a plain 24-hour hour + minute pair (via onSelect) so the
// caller can build a real Date with it -- only the DISPLAYED label is
// 12-hour/AM-PM, exactly as the spec asks for ("store reliable ISO/date-time
// values, display user-friendly AM/PM values").
export const TimePickerModal: React.FC<Props> = ({ visible, title, value, onClose, onSelect }) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const selectedIndex = useMemo(
    () => SLOTS.findIndex((s) => s.hour24 === value.getHours() && s.minute === (value.getMinutes() < 30 ? 0 : 30)),
    [value],
  );

  const onModalShow = () => {
    // Center the currently-selected slot rather than always opening at the
    // top of the list -- each row is 52px tall (see styles.row).
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(idx - 3, 0) * 52, animated: false });
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} onShow={onModalShow}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, shadows.lg, { paddingBottom: insets.bottom + spacing.md, maxHeight: '70%' }]}>
          <View style={styles.headerRow}>
            <Text style={typography.headingSm}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close time picker">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ marginTop: spacing.xs }}>
            {SLOTS.map((slot, idx) => {
              const selected = idx === selectedIndex;
              return (
                <Pressable
                  key={slot.label}
                  onPress={() => onSelect(slot.hour24, slot.minute)}
                  style={[styles.row, selected ? styles.rowSelected : undefined]}
                  accessibilityRole="button"
                  accessibilityLabel={slot.label}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.rowText, selected ? styles.rowTextSelected : undefined]}>{slot.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  rowSelected: { backgroundColor: colors.onPrimary },
  rowText: { ...typography.titleMd, color: colors.textPrimary },
  rowTextSelected: { color: colors.white, fontWeight: '700' },
});
