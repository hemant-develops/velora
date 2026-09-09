import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onPressFilter?: () => void;
  filterBadgeCount?: number;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({
  value,
  onChangeText,
  onPressFilter,
  filterBadgeCount = 0,
  placeholder = 'Search for cars or brands',
}) => (
  <View style={styles.row}>
    <View style={styles.searchBox}>
      <Ionicons name="search" size={18} color={colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
    {onPressFilter ? (
      <Pressable style={styles.filterBtn} onPress={onPressFilter} accessibilityLabel="Open filters">
        <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
        {filterBadgeCount > 0 ? (
          <View style={styles.badge}>
            <Ionicons name="ellipse" size={8} color={colors.primary} />
          </View>
        ) : null}
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  input: { flex: 1, marginLeft: 8, ...typography.bodyMd, color: colors.textPrimary, paddingVertical: 0 },
  filterBtn: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  badge: { position: 'absolute', top: 6, right: 6 },
});
