import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../theme';
import { useFavorites } from '../context/FavoritesContext';

interface Props {
  carId: string;
  size?: number;
  style?: object;
}

export const FavoriteButton: React.FC<Props> = ({ carId, size = 18, style }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(carId);

  return (
    <Pressable
      onPress={() => toggleFavorite(carId)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ selected: active }}
      style={[styles.circle, shadows.sm, style]}
    >
      <Ionicons name={active ? 'heart' : 'heart-outline'} size={size} color={active ? colors.danger : colors.textPrimary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
