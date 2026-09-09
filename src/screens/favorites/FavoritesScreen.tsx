import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CarCard } from '../../components/CarCard';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { useFavorites } from '../../context/FavoritesContext';
import { useCars } from '../../context/CarsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

export const FavoritesScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { favoriteIds } = useFavorites();
  const { cars, isLoaded } = useCars();
  const favoriteCars = cars.filter((c) => favoriteIds.includes(c.id));

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <LoadingState message="Loading favorites..." />
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
