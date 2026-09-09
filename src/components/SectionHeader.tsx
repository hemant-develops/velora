import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';

interface Props {
  title: string;
  onSeeAll?: () => void;
}

export const SectionHeader: React.FC<Props> = ({ title, onSeeAll }) => (
  <View style={styles.row}>
    <Text style={typography.headingSm}>{title}</Text>
    {onSeeAll ? (
      <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
        <Text style={styles.seeAllText}>See all</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: { ...typography.titleMd, color: colors.primaryDark, marginRight: 2 },
});
