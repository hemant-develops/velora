import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { SectionHeader } from './SectionHeader';
import { CarCard } from './CarCard';
import { supabase } from '../lib/supabase';
import { Car } from '../types';

// ADMIN CONNECT -- reads public.featured_listings (admin-managed, see
// velora-admin's Featured Listings page) via the active-only RLS policy
// added in 0019_admin_app_connect.sql, then resolves each car_id against
// CarsContext's already-loaded, already-active-filtered `cars` list -- no
// second full car fetch, and a car the owner has since deactivated simply
// drops out of the row instead of showing a broken card.
interface Props {
  cars: Car[];
  onPressCar: (carId: string) => void;
}

interface FeaturedRow {
  car_id: string;
  display_order: number;
}

export const FeaturedCarsSection: React.FC<Props> = ({ cars, onPressCar }) => {
  const [rows, setRows] = useState<FeaturedRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('featured_listings')
      .select('car_id, display_order')
      .order('display_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.log(`VELORA_FEATURED_LISTINGS_FETCH_ERROR: ${error.message}`);
          setRows([]);
        } else {
          setRows((data ?? []) as FeaturedRow[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  const byId = new Map(cars.map((c) => [c.id, c]));
  const featuredCars = rows.map((r) => byId.get(r.car_id)).filter((c): c is Car => !!c);
  if (featuredCars.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Featured Cars" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
        {featuredCars.map((car) => (
          <CarCard key={car.id} car={car} variant="compact" onPress={() => onPressCar(car.id)} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl },
});
