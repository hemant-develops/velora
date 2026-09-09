import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Brand } from '../types';
import { colors, spacing, typography } from '../theme';

interface Props {
  brands: Brand[];
  selectedBrandId?: string | null;
  onSelectBrand: (brandId: string) => void;
}

export const BrandCarousel: React.FC<Props> = ({ brands, selectedBrandId, onSelectBrand }) => (
  <FlatList
    data={brands}
    horizontal
    showsHorizontalScrollIndicator={false}
    keyExtractor={(item) => item.id}
    contentContainerStyle={{ paddingRight: spacing.md }}
    renderItem={({ item }) => {
      const selected = item.id === selectedBrandId;
      return (
        <Pressable style={styles.item} onPress={() => onSelectBrand(item.id)}>
          <View style={[styles.circle, selected ? styles.circleSelected : undefined]}>
            <Image source={{ uri: item.logo }} style={styles.image} />
          </View>
          <Text style={[typography.bodySm, styles.name, selected ? styles.nameSelected : undefined]} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
      );
    }}
  />
);

const styles = StyleSheet.create({
  item: { alignItems: 'center', marginRight: spacing.md, width: 68 },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  circleSelected: { borderColor: colors.primary },
  image: { width: '100%', height: '100%' },
  name: { marginTop: 6, color: colors.textSecondary, textAlign: 'center' },
  nameSelected: { color: colors.textPrimary, fontWeight: '700' },
});
