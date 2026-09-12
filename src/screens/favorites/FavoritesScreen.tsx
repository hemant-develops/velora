import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CarCard } from '../../components/CarCard';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { CarCardSkeleton } from '../../components/SkeletonLoader';
import { useFavorites } from '../../context/FavoritesContext';
import { useCars } from '../../context/CarsContext';
import { SORT_OPTIONS, SortKey, sortCars } from '../../utils/sortCars';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

export const FavoritesScreen: React.FC<Props> = ({ navigation }) => {
  const { favoriteIds } = useFavorites();
  const { cars, isLoaded } = useCars();
  // M10 -- "favorites and sorting should work together coherently": reuses
  // the exact same sort options/logic Home already uses (see utils/sortCars)
  // rather than a bespoke scheme, so a renter with several saved cars can
  // find the cheapest/best-rated one here the same way they would on Home.
  const [sortBy, setSortBy] = useState<SortKey>('recommended');
  const favoriteCars = useMemo(
    () => sortCars(cars.filter((c) => favoriteIds.includes(c.id)), sortBy),
    [cars, favoriteIds, sortBy],
  );

  // B3 -- mirrors the real layout below (header + a couple of CarCards)
  // instead of a centered spinner, the same "skeleton resembles final
  // layout" treatment Home/CarDetails/My Rents/Owner Dashboard already use
  // -- reuses the existing CarCardSkeleton rather than a bespoke component,
  // since a favorited car renders as exactly the same CarCard as everywhere
  // else in the app.
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Favorites" onBack={() => navigation.goBack()} />
        <View style={{ padding: spacing.lg }}>
          <CarCardSkeleton />
          <CarCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Favorites" onBack={() => navigation.goBack()} />

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        data={favoriteCars}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          favoriteCars.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {SORT_OPTIONS.map((opt) => (
                <Chip key={opt.key} label={opt.label} selected={sortBy === opt.key} onPress={() => setSortBy(opt.key)} />
              ))}
            </ScrollView>
          ) : null
        }
        renderItem={({ item }) => (
          <CarCard
            car={item}
            onPress={() => navigation.navigate('CarDetails', { carId: item.id })}
            onPressBook={() => navigation.navigate('CarDetails', { carId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="heart-outline" title="No favorites yet" subtitle="Tap the heart icon on any car to save it here." />
        }
      />
    </View>
  );
};
