import React, { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHeader } from '../../components/SectionHeader';
import { BrandCarousel } from '../../components/BrandCarousel';
import { CarCard } from '../../components/CarCard';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { colors, spacing, typography } from '../../theme';
import { brands } from '../../data/brands';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { CarCategory } from '../../types';

const CATEGORIES: CarCategory[] = [
  'Economy',
  'Hatchback',
  'Sedan',
  'SUV',
  'MUV',
  'Premium',
  'Luxury Sedan',
  'Sports Car',
  'Convertible',
  'Electric',
];

type SortKey = 'recommended' | 'price_low' | 'price_high' | 'rating';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_low', label: 'Price: Low to High' },
  { key: 'price_high', label: 'Price: High to Low' },
  { key: 'rating', label: 'Top Rated' },
];

const TRUST_POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'chatbubble-ellipses-outline', title: 'Talk to the owner directly', body: 'Message any owner before you book — no middleman.' },
  { icon: 'pricetag-outline', title: 'Transparent pricing', body: "The price you see is the price you pay. No hidden fees." },
  { icon: 'car-sport-outline', title: 'Real Indian cars', body: 'Every listing is a real car from a real owner near you.' },
];

export const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user } = useAuth();
  const navigation = useAppNavigation();
  const { cars, isLoaded, searchQuery, setSearchQuery, filteredCars, activeFilterCount } = useCars();
  const { getUnreadCountForUser } = useNotifications();
  const [selectedCategory, setSelectedCategory] = useState<CarCategory | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('recommended');

  if (!user) return null;

  // Cars are read from AsyncStorage asynchronously — without this gate the
  // marketplace briefly renders as "empty" (and shows the wrong empty-state
  // copy) on every cold start, before the real listings have loaded in.
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <LoadingState message="Loading cars..." />
      </View>
    );
  }

  // Home's own category chips are a quick, no-modal-required filter for the
  // most common case; the full Filter screen (brand/price/transmission/...)
  // is still the single advanced source of truth in CarsContext. Brand
  // filtering deliberately does NOT happen here anymore -- see
  // BrandCarsScreen for why tapping a brand now pushes a real screen instead
  // of filtering this list in place.
  const categoryFiltered = filteredCars.filter((c) => !selectedCategory || c.category === selectedCategory);

  // Home's list is short enough (owner-listed marketplace, not a large
  // catalog) that re-sorting on every render is cheap -- no useMemo needed,
  // and skipping it here avoids ever calling a hook after the early returns
  // above.
  let visibleCars = categoryFiltered;
  if (sortBy !== 'recommended') {
    visibleCars = [...categoryFiltered];
    if (sortBy === 'price_low') visibleCars.sort((a, b) => a.pricePerDay - b.pricePerDay);
    else if (sortBy === 'price_high') visibleCars.sort((a, b) => b.pricePerDay - a.pricePerDay);
    else if (sortBy === 'rating') visibleCars.sort((a, b) => b.rating - a.rating);
  }

  const isSearching = searchQuery.trim().length > 0 || activeFilterCount > 0 || !!selectedCategory;
  const marketplaceEmpty = cars.length === 0;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: tabBarClearance }}
      data={visibleCars}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <AppHeader
            user={user}
            onPressNotifications={() => navigation.navigate('Notifications')}
            onPressAvatar={() => navigation.navigate('EditProfile')}
            onPressLocation={() => navigation.navigate('LocationPicker')}
            hasUnreadNotifications={getUnreadCountForUser(user.id) > 0}
          />

          <View style={{ marginTop: spacing.lg }}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onPressFilter={() => navigation.navigate('Filter')}
              filterBadgeCount={activeFilterCount}
              placeholder="Search cars, brands, categories..."
            />
          </View>

          {!marketplaceEmpty ? (
            <>
              {!isSearching && (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Browse by Brand" />
                  <BrandCarousel
                    brands={brands}
                    selectedBrandId={null}
                    onSelectBrand={(id) => navigation.navigate('BrandCars', { brandId: id })}
                  />
                </View>
              )}

              <View style={{ marginTop: spacing.xl }}>
                <SectionHeader title={isSearching ? 'Search Results' : 'Find Your Perfect Ride'} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Chip label="All" selected={!selectedCategory} onPress={() => setSelectedCategory(null)} />
                  {CATEGORIES.map((cat) => (
                    <Chip key={cat} label={cat} selected={selectedCategory === cat} onPress={() => setSelectedCategory((c) => (c === cat ? null : cat))} />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>{visibleCars.length} car{visibleCars.length === 1 ? '' : 's'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {SORT_OPTIONS.map((opt) => (
                    <Chip key={opt.key} label={opt.label} selected={sortBy === opt.key} onPress={() => setSortBy(opt.key)} />
                  ))}
                </ScrollView>
              </View>
            </>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <CarCard
          car={item}
          onPress={() => navigation.navigate('CarDetails', { carId: item.id })}
          onPressBook={() => navigation.navigate('CarDetails', { carId: item.id })}
        />
      )}
      ListFooterComponent={
        !marketplaceEmpty && !isSearching && visibleCars.length > 0 ? (
          <View style={styles.trustSection}>
            <SectionHeader title="Why Rent with Velora?" />
            {TRUST_POINTS.map((point) => (
              <View key={point.title} style={styles.trustRow}>
                <View style={styles.trustIconCircle}>
                  <Ionicons name={point.icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.trustTitle}>{point.title}</Text>
                  <Text style={styles.trustBody}>{point.body}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null
      }
      ListEmptyComponent={
        marketplaceEmpty ? (
          <EmptyState
            icon="car-sport-outline"
            title="No cars listed yet"
            subtitle="Nobody has listed a car for rent yet. Switch to Owner Mode from your Profile to list the very first one!"
          />
        ) : (
          <EmptyState icon="car-outline" title="No cars match your filters" subtitle="Try a different category, clear your search, or adjust your filters." />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  sortLabel: { ...typography.bodySm, color: colors.textSecondary, marginRight: spacing.sm },
  trustSection: { marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  trustRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  trustIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustTitle: { ...typography.titleMd, color: colors.textPrimary },
  trustBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
});
