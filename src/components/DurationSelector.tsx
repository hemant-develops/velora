import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import { Chip } from './Chip';
import { DURATION_PRESETS_HOURS, MIN_DURATION_HOURS, formatDurationHours } from '../utils/duration';

interface Props {
  // The selected preset, or 'custom' when the renter is entering their own
  // hour count. null customHours means "custom selected but not typed yet".
  selectedPreset: number | 'custom';
  customHours: number | null;
  onSelectPreset: (hours: number) => void;
  onSelectCustom: () => void;
  onChangeCustomHours: (hours: number | null) => void;
  // PHASE 2 -- which presets this specific car actually offers (see
  // Car.enabledDurationPresets). Defaults to all four so every call site
  // written before this prop existed (and any car without the field set)
  // keeps showing exactly the same four chips as Phase 1.
  presets?: readonly number[];
}

// 6h / 12h / 24h / 48h / Custom duration chips (spec item 1 + 2). Picking a
// preset is a single tap; picking Custom reveals a plain numeric hour input
// with a MIN_DURATION_HOURS floor and deliberately NO ceiling -- the spec is
// explicit that manual duration must never be capped at 48h.
export const DurationSelector: React.FC<Props> = ({
  selectedPreset,
  customHours,
  onSelectPreset,
  onSelectCustom,
  onChangeCustomHours,
  presets = DURATION_PRESETS_HOURS,
}) => {
  const customInvalid = selectedPreset === 'custom' && customHours !== null && customHours < MIN_DURATION_HOURS;

  return (
    <View>
      <View style={styles.chipRow}>
        {presets.map((hours) => (
          <Chip
            key={hours}
            label={formatDurationHours(hours)}
            selected={selectedPreset === hours}
            onPress={() => onSelectPreset(hours)}
          />
        ))}
        <Chip label="Custom" selected={selectedPreset === 'custom'} onPress={onSelectCustom} />
      </View>

      {selectedPreset === 'custom' ? (
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>Duration (hours)</Text>
          <TextInput
            value={customHours === null ? '' : String(customHours)}
            onChangeText={(text) => {
              const digitsOnly = text.replace(/[^0-9]/g, '');
              onChangeCustomHours(digitsOnly === '' ? null : Number(digitsOnly));
            }}
            keyboardType="number-pad"
            placeholder={`${MIN_DURATION_HOURS}+`}
            placeholderTextColor={colors.textTertiary}
            style={[styles.customInput, customInvalid ? styles.customInputInvalid : undefined]}
            accessibilityLabel="Custom duration in hours"
          />
        </View>
      ) : null}
      {customInvalid ? (
        <Text style={styles.errorText}>Minimum duration is {MIN_DURATION_HOURS} hours.</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  customLabel: { ...typography.bodyMd, color: colors.textSecondary },
  customInput: {
    ...typography.titleMd,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 80,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  customInputInvalid: { borderColor: colors.danger },
  errorText: { ...typography.bodySm, color: colors.danger, marginTop: spacing.xs },
});
