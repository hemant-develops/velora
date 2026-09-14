import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { CircleIconButton } from '../../components/CircleIconButton';
import { CarCard } from '../../components/CarCard';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';

type Props = NativeStackScreenProps<RootStackParamList, 'BrandCars'>;

// A dedicated, PUSHED screen for "Home -> tap a brand".
//
// This used to be an in-place filter on the Home tab (`selectedBrandId`
// local state). That was the root cause of the "brand tap traps you on an
// empty screen with no way back" bug: selecting a brand hid the very brand
// carousel that let you change/clear it (Home only showed the carousel
// while nothing was filtered), and a tab-root screen has no header/back
// button at all -- so a brand with zero current listings left the renter
// stuck looking at "No cars found" with no visible way out, and even
// switching tabs and back didn't help since React Navigation keeps tab
// screens (and their state) mounted.
//
// Pushing a real stack screen fixes all of that structurally: it always has
// its own header and a working Back button, it never lingers (dismissing it
// always returns to a clean, unfiltered Home), and a genuinely empty brand
// gets a proper empty state with a "View All Cars" way out instead of a
// dead end. `cars` here is CarsContext's already-active-only list -- the
// same single source of truth Home/Search/Favorites all read from, so this
// never re-implements the active/inactive filtering rule.
export const BrandCarsScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { cars, setSearchQuery, resetFilters } = useCars();
  const { brands, getModelsForBrand } = useCatalog();
  const { brandId } = route.params;
  const brand = brands.find((b) => b.id === brandId);
  const brandCars = cars.filter((c) => c.brandId === brandId);

  // PHASE A (Catalog) -- Browse by Brand -> Model -> Cars. Only canonical,
  // reviewed models show as filter chips here (a still-pending custom model
  // some other owner submitted has no business appearing as a public browse
  // filter yet) -- see car_models RLS in the migration for why `isActive`
  // is exactly the right gate. A brand with no catalog models at all (the
  // pre-existing exotic/global brands, or any brand an admin hasn't
  // modeled yet) simply skips this row entirely, same fallback-to-nothing
  // pattern already used in the owner listing wizard's Model picker.
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const models = getModelsForBrand(brandId).filter((m) => m.isActive);
  const visibleCars = selectedModelId ? brandCars.filter((c) => c.modelId === selectedModelId) : brandCars;

  // "View All Cars" only ever appears here when this specific brand has zero
  // active listings — it's promising the renter every active car, not
  // whatever search text or advanced Filter selection happened to still be
  // set on Home from before they tapped this brand. Home itself never held
  // brand state (see the note above), but its shared CarsContext search/
  // filter state is global and would otherwise still narrow the list they
  // land on, silently breaking that promise.
  const onViewAllCars = () => {
    setSearchQuery('');
    resetFilters();
    navigation.navigate('Main', { screen: 'HomeTab' });
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      data={visibleCars}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <CircleIconButton icon="arrow-back" onPress={() => navigation.goBack()} accessibilityLabel="Go back" background={colors.surface} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={typography.headingSm} numberOfLines={1}>{brand?.name ?? 'Cars'}</Text>
              <Text style={styles.count}>{visibleCars.length} car{visibleCars.length === 1 ? '' : 's'} available</Text>
            </View>
          </View>
          {models.length > 0 && (
            <View style={styles.modelChipRow}>
              <Chip label="All Models" selected={selectedModelId === null} onPress={() => setSelectedModelId(null)} />
              {models.map((m) => (
                <Chip key={m.id} label={m.name} selected={selectedModelId === m.id} onPress={() => setSelectedModelId(m.id)} />
              ))}
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <CarCard
          car={item}
          onPress={() => navigation.navigate('CarDetails', { carId: item.id })}
          onPressBook={() => navigation.navigate('CarDetails', { carId: item.id })}
        />
      )}
      ListEmptyComponent={
        <View>
          <EmptyState
            icon="car-sport-outline"
            title={selectedModelId ? `No matching ${brand?.name ?? 'cars'} available` : `No ${brand?.name ?? 'cars'} available right now`}
            subtitle={
              selectedModelId
                ? 'No owner has an active listing for this model right now. Try another model or view all cars for this brand.'
                : 'No owner has an active listing for this brand at the moment. Browse all available cars instead.'
            }
          />
          {selectedModelId ? (
            <PrimaryButton label="View All Models" onPress={() => setSelectedModelId(null)} variant="outline" style={{ marginTop: spacing.sm }} />
          ) : (
            <PrimaryButton label="View All Cars" onPress={onViewAllCars} variant="outline" style={{ marginTop: spacing.sm }} />
          )}
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.md },
  count: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  modelChipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: spacing.md },
});
