import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { CircleIconButton } from '../../components/CircleIconButton';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { brands } from '../../data/brands';
import { defaultFilters, useCars } from '../../context/CarsContext';
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
const PRICE_STEPS = [2000, 4000, 6000, 10000, 15000, 25000, 40000];

export const FilterScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { filters, setFilters } = useCars();
  const [local, setLocal] = useState(filters);

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

        <Text style={styles.label}>Max Price per Day</Text>
        <View style={styles.chipRow}>
          {PRICE_STEPS.map((p) => (
            <Chip key={p} label={formatCurrency(p)} selected={local.maxPrice === p} onPress={() => setLocal((f) => ({ ...f, maxPrice: p }))} />
          ))}
        </View>

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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton label="Reset" onPress={onReset} variant="outline" fullWidth={false} style={{ flex: 1, marginRight: spacing.sm }} />
        <PrimaryButton label="Apply Filters" onPress={onApply} fullWidth={false} style={{ flex: 2 }} />
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
