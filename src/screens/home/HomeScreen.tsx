import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { SearchBar } from '../../components/SearchBar';
import { SectionHeader } from '../../components/SectionHeader';
import { BrandCarousel } from '../../components/BrandCarousel';
import { FeaturedCarsSection } from '../../components/FeaturedCarsSection';
import { AdsBanner } from '../../components/AdsBanner';
import { CarCard } from '../../components/CarCard';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';
import { useBookings } from '../../context/BookingsContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { CarCategory } from '../../types';
import { SORT_OPTIONS, SortKey, sortCars } from '../../utils/sortCars';

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
  const { cars, isLoaded, searchQuery, setSearchQuery, filteredCars, activeFilterCount, filters } = useCars();
  const { brands } = useCatalog();
  const { getAvailableQuantity } = useBookings();
  const { getUnreadCountForUser } = useNotifications();
  const [selectedCategory, setSelectedCategory] = useState<CarCategory | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('recommended');
  // M9 -- "Relevant location functionality". A lightweight, local-only quick
  // filter (same precedent as `selectedCategory` above) rather than a new
  // CarsContext/FilterState field, since it depends on the CURRENT user's own
  // location (AuthContext), not a general filter any screen would reuse.
  const [nearMeOnly, setNearMeOnly] = useState(false);

  if (!user) return null;

  // Cars are read from Supabase asynchronously — without this gate the
  // marketplace briefly renders as "empty" (and shows the wrong empty-state
  // copy) on every cold start, before the real listings have loaded in.
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <HomeSkeleton topInset={insets.top} />
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

  // M7 -- "Available Now" (set from the Filter screen) is applied here
  // rather than inside CarsContext.filteredCars, since answering it needs
  // BookingsContext.getAvailableQuantity and CarsContext has no dependency on
  // BookingsContext today -- see the FilterState.availableOnly comment.
  // Single-day (today, today) range, the same pattern OwnerDashboardScreen
  // already uses for its date-independent "booked now" count.
  const todayIso = new Date().toISOString();
  const availabilityFiltered = filters.availableOnly
    ? categoryFiltered.filter((c) => getAvailableQuantity(c.id, todayIso, todayIso) > 0)
    : categoryFiltered;

  // Home's list is short enough (owner-listed marketplace, not a large
  // catalog) that re-sorting on every render is cheap -- no useMemo needed,
  // and skipping it here avoids ever calling a hook after the early returns
  // above. M10 -- shared with FavoritesScreen via utils/sortCars so sorting
  // behaves identically wherever a renter sees a list of cars.
  let visibleCars = sortCars(availabilityFiltered, sortBy);

  // "Near Me" -- derive the user's own city from the free-text `location`
  // profile field (e.g. "Bengaluru, Karnataka" -> "Bengaluru") the same way
  // it's already displayed in AppHeader, and match it against each car's own
  // `location` string. Case-insensitive substring match keeps this working
  // whether either string carries a state/country suffix.
  const userCity = user.location?.split(',')[0]?.trim().toLowerCase() ?? '';
  const canFilterNearMe = userCity.length > 0;
  if (nearMeOnly && canFilterNearMe) {
    visibleCars = visibleCars.filter((c) => c.location.toLowerCase().includes(userCity));
  }

  const isSearching = searchQuery.trim().length > 0 || activeFilterCount > 0 || !!selectedCategory || nearMeOnly;
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

          {!isSearching && <AdsBanner />}

          {!marketplaceEmpty ? (
            <>
              {!isSearching && (
                <Pressable
                  style={[styles.offersBanner, shadows.sm]}
                  onPress={() => navigation.navigate('Offers')}
                  accessibilityRole="button"
                  accessibilityLabel="View promo codes"
                >
                  <View style={styles.offersIconWrap}>
                    <Ionicons name="pricetag" size={18} color={colors.onPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.offersTitle}>Save on your next trip</Text>
                    <Text style={styles.offersBody}>Tap to see VELORA promo codes</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
                </Pressable>
              )}
              {!isSearching && (
                <FeaturedCarsSection cars={cars} onPressCar={(carId) => navigation.navigate('CarDetails', { carId })} />
              )}

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
                  {canFilterNearMe ? (
                    <Chip label="Near Me" selected={nearMeOnly} onPress={() => setNearMeOnly((v) => !v)} />
                  ) : null}
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
            <View style={[styles.trustCard, shadows.sm]}>
              {TRUST_POINTS.map((point, index) => (
                <View key={point.title}>
                  {index > 0 ? <View style={styles.trustDivider} /> : null}
                  <View style={styles.trustRow}>
                    <View style={styles.trustIconCircle}>
                      <Ionicons name={point.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.trustTitle}>{point.title}</Text>
                      <Text style={styles.trustBody}>{point.body}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
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
  offersBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  offersIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(26,26,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offersTitle: { ...typography.titleMd, color: colors.onPrimary },
  offersBody: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.85, marginTop: 2 },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  sortLabel: { ...typography.bodySm, color: colors.textSecondary, marginRight: spacing.sm },
  trustSection: { marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  trustCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md },
  trustDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  trustRow: { flexDirection: 'row', alignItems: 'flex-start' },
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
