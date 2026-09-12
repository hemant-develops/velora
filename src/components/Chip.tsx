import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const Chip: React.FC<Props> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected }}
    style={[styles.chip, selected ? styles.chipSelected : undefined]}
  >
    <Text style={[typography.bodySm, styles.text, selected ? styles.textSelected : undefined]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.onPrimary, borderColor: colors.onPrimary },
  text: { color: colors.textSecondary, fontWeight: '600' },
  textSelected: { color: colors.white },
});
