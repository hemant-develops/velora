import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';

interface Props {
  value: number;
  reviewCount?: number;
  size?: number;
  compact?: boolean;
}

export const Rating: React.FC<Props> = ({ value, reviewCount, size = 14, compact }) => {
  const isNew = reviewCount === 0;

  return (
    <View style={styles.row}>
      <Ionicons name="star" size={size} color={isNew ? colors.textTertiary : colors.star} />
      <Text style={[typography.bodySm, styles.value]}>{isNew ? 'New' : value.toFixed(1)}</Text>
      {reviewCount !== undefined && !isNew ? (
        <Text style={[typography.bodySm, styles.count]}>
          {compact ? `(${reviewCount})` : `(${reviewCount}+ Review${reviewCount === 1 ? '' : 's'})`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  value: { color: colors.textPrimary, fontWeight: '700', marginLeft: 4 },
  count: { color: colors.textSecondary, marginLeft: 4 },
});
