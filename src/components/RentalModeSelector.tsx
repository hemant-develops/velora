import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';
import { RentalMode } from '../types';
import { formatCurrency } from '../utils/format';

interface Props {
  value: RentalMode;
  onChange: (mode: RentalMode) => void;
  selfDrivePrice: number;
  withDriverPrice: number;
  availableModes: RentalMode[];
}

const OPTIONS: { mode: RentalMode; label: string; icon: keyof typeof Ionicons.glyphMap; caption: string }[] = [
  { mode: 'self_drive', label: 'Self Drive', icon: 'car-sport-outline', caption: 'You drive' },
  { mode: 'with_driver', label: 'With Driver', icon: 'person-outline', caption: 'Driver included' },
];

export const RentalModeSelector: React.FC<Props> = ({ value, onChange, selfDrivePrice, withDriverPrice, availableModes }) => (
  <View style={styles.row}>
    {OPTIONS.map((option) => {
      const disabled = !availableModes.includes(option.mode);
      const selected = value === option.mode;
      const price = option.mode === 'self_drive' ? selfDrivePrice : withDriverPrice;

      return (
        <Pressable
          key={option.mode}
          disabled={disabled}
          onPress={() => onChange(option.mode)}
          style={[
            styles.card,
            selected ? styles.cardSelected : undefined,
            disabled ? styles.cardDisabled : undefined,
          ]}
        >
          <Ionicons name={option.icon} size={22} color={selected ? colors.onPrimary : colors.textPrimary} />
          <Text style={[styles.label, selected ? styles.labelSelected : undefined]}>{option.label}</Text>
          <Text style={[styles.caption, selected ? styles.captionSelected : undefined]}>
            {disabled ? 'Not available' : option.caption}
          </Text>
          <Text style={[styles.price, selected ? styles.priceSelected : undefined]}>
            {formatCurrency(price)}
            <Text style={styles.priceUnit}>/day</Text>
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginRight: spacing.sm,
  },
  cardSelected: { backgroundColor: colors.onPrimary, borderColor: colors.onPrimary },
  cardDisabled: { opacity: 0.4 },
  label: { ...typography.titleMd, color: colors.textPrimary, marginTop: 8 },
  labelSelected: { color: colors.white },
  caption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  captionSelected: { color: 'rgba(255,255,255,0.7)' },
  price: { ...typography.titleLg, color: colors.textPrimary, marginTop: 8 },
  priceSelected: { color: colors.primary },
  priceUnit: { ...typography.bodySm, fontWeight: '400' },
});
