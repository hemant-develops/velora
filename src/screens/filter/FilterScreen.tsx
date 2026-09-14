import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { CircleIconButton } from '../../components/CircleIconButton';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { RangeSlider } from '../../components/RangeSlider';
import { defaultFilters, useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';
import { CarCategory, FuelType, RentalMode, Transmission } from '../../types';
import { formatCurrency } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Filter'>;

const CATEGORIES: (CarCategory | 'Any')[] = [
  'Any',
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
const TRANSMISSIONS: (Transmission | 'Any')[] = ['Any', 'Automatic', 'Manual'];
const FUEL_TYPES: (FuelType | 'Any')[] = ['Any', 'Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'];
const RENTAL_MODES: { key: RentalMode | 'Any'; label: string }[] = [
  { key: 'Any', label: 'Any' },
  { key: 'self_drive', label: 'Self Drive' },
  { key: 'with_driver', label: 'With Driver' },
];
const SEATS_OPTIONS: (number | 'Any')[] = ['Any', 2, 4, 5, 7];

export const FilterScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { filters, setFilters, cars } = useCars();
  const { brands } = useCatalog();
  const [local, setLocal] = useState(filters);

  // Sensible bounds for the price slider, derived from the actual cars
  // currently in the marketplace -- not a hardcoded guess. Falls back to
  // the existing default range when the catalog is empty so the slider
  // still renders something sensible before any car has been listed.
  const priceBounds = useMemo(() => {
    if (cars.length === 0) return { min: 0, max: defaultFilters.maxPrice };
    const prices = cars.map((c) => c.pricePerDay);
    return { min: Math.min(...prices), max: Math.max(...prices, defaultFilters.maxPrice) };
  }, [cars]);
  const priceStep = Math.max(100, Math.round((priceBounds.max - priceBounds.min) / 40 / 100) * 100);

  // Live "N cars match" preview, computed against the SAME predicate
  // CarsContext.filteredCars already uses for its own text-search + filter
  // matching (kept in sync with it deliberately) -- but evaluated against
  // `local` (this screen's in-progress selection) rather than the
  // committed `filters`, and against `cars` (already active-only) rather
  // than searchQuery, since this screen only edits filters, not the
  // search box. `availableOnly` is intentionally excluded here, matching
  // CarsContext.filteredCars itself -- answering it needs
  // BookingsContext.getAvailableQuantity per car, which HomeScreen applies
  // separately; doing that for every keystroke on this screen would be a
  // real perf cost for a "roughly how many" preview number.
  const matchingCount = useMemo(() => {
    return cars.filter((car) => {
      if (local.brandIds.length > 0 && !local.brandIds.includes(car.brandId)) return false;
      if (car.pricePerDay < local.minPrice || car.pricePerDay > local.maxPrice) return false;
      if (local.transmission !== 'Any' && car.transmission !== local.transmission) return false;
      if (local.fuelType !== 'Any' && car.fuelType !== local.fuelType) return false;
      if (local.category !== 'Any' && car.category !== local.category) return false;
      if (local.rentalMode !== 'Any' && !car.rentalModes.includes(local.rentalMode)) return false;
      if (local.seats !== 'Any' && car.seats < local.seats) return false;
      return true;
    }).length;
  }, [cars, local]);

  const toggleBrand = (brandId: string) => {
    setLocal((f) => ({
      ...f,
      brandIds: f.brandIds.includes(brandId) ? f.brandIds.filter((id) => id !== brandId) : [...f.brandIds, brandId],
    }));
  };

  const onApply = () => {
    setFilters(local);
    navigation.goBack();
  };

  const onReset = () => {
    setLocal(defaultFilters);
    setFilters(defaultFilters);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <CircleIconButton icon="close" onPress={() => navigation.goBack()} accessibilityLabel="Close filters" background={colors.surface} />
        <Text style={typography.headingSm}>Filters</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={styles.label}>Rental Mode</Text>
        <View style={styles.chipRow}>
          {RENTAL_MODES.map((m) => (
            <Chip key={m.key} label={m.label} selected={local.rentalMode === m.key} onPress={() => setLocal((f) => ({ ...f, rentalMode: m.key }))} />
          ))}
        </View>

        <Text style={styles.label}>Brand</Text>
        <View style={styles.chipRow}>
          {brands.map((b) => (
            <Chip key={b.id} label={b.name} selected={local.brandIds.includes(b.id)} onPress={() => toggleBrand(b.id)} />
          ))}
        </View>

        <Text style={styles.label}>Price per Day</Text>
        <RangeSlider
          min={priceBounds.min}
          max={priceBounds.max}
          valueMin={local.minPrice}
          valueMax={local.maxPrice}
          step={priceStep}
          formatValue={formatCurrency}
          onChange={(nextMin, nextMax) => setLocal((f) => ({ ...f, minPrice: nextMin, maxPrice: nextMax }))}
        />

        <Text style={styles.label}>Transmission</Text>
        <View style={styles.chipRow}>
          {TRANSMISSIONS.map((t) => (
            <Chip key={t} label={t} selected={local.transmission === t} onPress={() => setLocal((f) => ({ ...f, transmission: t }))} />
          ))}
        </View>

        <Text style={styles.label}>Fuel Type</Text>
        <View style={styles.chipRow}>
          {FUEL_TYPES.map((f) => (
            <Chip key={f} label={f} selected={local.fuelType === f} onPress={() => setLocal((prev) => ({ ...prev, fuelType: f }))} />
          ))}
        </View>

        <Text style={styles.label}>Seats</Text>
        <View style={styles.chipRow}>
          {SEATS_OPTIONS.map((s) => (
            <Chip key={s} label={s === 'Any' ? 'Any' : `${s}+`} selected={local.seats === s} onPress={() => setLocal((f) => ({ ...f, seats: s }))} />
          ))}
        </View>

        <Text style={styles.label}>Car Type</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={local.category === c} onPress={() => setLocal((f) => ({ ...f, category: c }))} />
          ))}
        </View>

        <Text style={styles.label}>Availability</Text>
        <View style={styles.chipRow}>
          <Chip
            label="Available Now"
            selected={local.availableOnly}
            onPress={() => setLocal((f) => ({ ...f, availableOnly: !f.availableOnly }))}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton label="Reset" onPress={onReset} variant="outline" fullWidth={false} style={{ flex: 1, marginRight: spacing.sm }} />
        <PrimaryButton
          label={matchingCount > 0 ? `Show ${matchingCount} Car${matchingCount === 1 ? '' : 's'}` : 'No Cars Match'}
          onPress={onApply}
          fullWidth={false}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8, marginTop: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
});
