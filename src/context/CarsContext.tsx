import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import { brands } from '../data/brands';
import { cars as legacySeedCars } from '../data/cars';
import { Car, FilterState } from '../types';

const OWNER_CARS_KEY = 'velora.ownerCars.v1';

// An earlier build of this app auto-seeded the marketplace with these demo
// car ids on first launch. That behavior has been removed (the marketplace
// is owner-listings only now), but a device that already ran that older
// build may still have them sitting in storage. This one-time cleanup strips
// them out on load so nobody sees "random" cars that no owner actually
// listed, regardless of which build they ran before.
const LEGACY_SEED_IDS = new Set(legacySeedCars.map((c) => c.id));

export const defaultFilters: FilterState = {
  brandIds: [],
  minPrice: 0,
  maxPrice: 40000,
  transmission: 'Any',
  fuelType: 'Any',
  category: 'Any',
  rentalMode: 'Any',
  seats: 'Any',
};

interface CarsContextValue {
  cars: Car[];
  isLoaded: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  resetFilters: () => void;
  activeFilterCount: number;
  filteredCars: Car[];
  brandNameOf: (brandId: string) => string;
  addOwnerCar: (car: Car) => Promise<void>;
  updateOwnerCar: (carId: string, patch: Partial<Car>) => Promise<void>;
  removeOwnerCar: (carId: string) => Promise<void>;
  getCarsByOwner: (ownerId: string) => Car[];
  getCarById: (carId: string) => Car | undefined;
  updateCarRating: (carId: string, newRating: number) => Promise<void>;
}

const CarsContext = createContext<CarsContextValue | undefined>(undefined);

export const CarsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The renter-facing marketplace is sourced ENTIRELY from cars that real
  // owners have listed through the app's "List My Car" flow. There is no
  // hardcoded/demo catalog mixed in — a brand-new install genuinely starts
  // with an empty marketplace, and a car only ever appears here the moment
  // an owner account publishes it.
  const [ownerCars, setOwnerCars] = useState<Car[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(OWNER_CARS_KEY);
        if (raw) {
          const stored: Car[] = JSON.parse(raw);
          const cleaned = stored.filter((c) => !LEGACY_SEED_IDS.has(c.id));
          setOwnerCars(cleaned);
          if (cleaned.length !== stored.length) {
            await storage.setItem(OWNER_CARS_KEY, JSON.stringify(cleaned));
          }
        }
      } catch {
        // Corrupted/unreadable storage — fall back to an empty marketplace
        // rather than leaving the app stuck on a loading state forever.
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const persistOwnerCars = async (next: Car[]) => {
    setOwnerCars(next);
    await storage.setItem(OWNER_CARS_KEY, JSON.stringify(next));
  };

  const addOwnerCar = async (car: Car) => {
    await persistOwnerCars([car, ...ownerCars]);
  };

  const updateOwnerCar = async (carId: string, patch: Partial<Car>) => {
    await persistOwnerCars(ownerCars.map((c) => (c.id === carId ? { ...c, ...patch } : c)));
  };

  const removeOwnerCar = async (carId: string) => {
    await persistOwnerCars(ownerCars.filter((c) => c.id !== carId));
  };

  // Recomputes a car's average rating using a simple running-average formula
  // (previous average weighted by its review count, plus the new rating),
  // then persists the updated car back into the same owner-listings store.
  const updateCarRating = async (carId: string, newRating: number) => {
    const next = ownerCars.map((c) => {
      if (c.id !== carId) return c;
      const nextCount = c.reviewCount + 1;
      const nextRating = Math.round(((c.rating * c.reviewCount + newRating) / nextCount) * 10) / 10;
      return { ...c, rating: nextRating, reviewCount: nextCount };
    });
    await persistOwnerCars(next);
  };

  const allCars = useMemo(() => (isLoaded ? ownerCars : []), [ownerCars, isLoaded]);

  // Only cars the owner has left visible ever reach a renter's search,
  // listing, favorites, or recommendations — `isActive === false` is the
  // only thing that hides a car, and toggling it never touches any existing
  // booking made on that car. `isActive` undefined/true both count as
  // visible, so every listing created before this field existed keeps
  // showing exactly as it did before.
  const activeCars = useMemo(() => allCars.filter((c) => c.isActive !== false), [allCars]);

  const brandNameOf = (brandId: string) => brands.find((b) => b.id === brandId)?.name ?? brandId;

  const filteredCars = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeCars.filter((car) => {
      if (q) {
        const haystack = `${car.name} ${brandNameOf(car.brandId)} ${car.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.brandIds.length > 0 && !filters.brandIds.includes(car.brandId)) return false;
      if (car.pricePerDay < filters.minPrice || car.pricePerDay > filters.maxPrice) return false;
      if (filters.transmission !== 'Any' && car.transmission !== filters.transmission) return false;
      if (filters.fuelType !== 'Any' && car.fuelType !== filters.fuelType) return false;
      if (filters.category !== 'Any' && car.category !== filters.category) return false;
      if (filters.rentalMode !== 'Any' && !car.rentalModes.includes(filters.rentalMode)) return false;
      if (filters.seats !== 'Any' && car.seats < filters.seats) return false;
      return true;
    });
  }, [activeCars, searchQuery, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.brandIds.length > 0) count += 1;
    if (filters.minPrice !== defaultFilters.minPrice || filters.maxPrice !== defaultFilters.maxPrice) count += 1;
    if (filters.transmission !== 'Any') count += 1;
    if (filters.fuelType !== 'Any') count += 1;
    if (filters.category !== 'Any') count += 1;
    if (filters.rentalMode !== 'Any') count += 1;
    if (filters.seats !== 'Any') count += 1;
    return count;
  }, [filters]);

  const value: CarsContextValue = {
    // Public-facing list: active cars only (search, Home, Favorites, ...).
    // Owner-scoped lookups below intentionally read from `allCars` instead,
    // so an owner always sees and can manage every one of their own cars —
    // active or not — and any existing car/booking detail route keeps
    // resolving even after the car is toggled inactive.
    cars: activeCars,
    isLoaded,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    resetFilters: () => setFilters(defaultFilters),
    activeFilterCount,
    filteredCars,
    brandNameOf,
    addOwnerCar,
    updateOwnerCar,
    removeOwnerCar,
    getCarsByOwner: (ownerId: string) => allCars.filter((c) => c.ownerId === ownerId),
    getCarById: (carId: string) => allCars.find((c) => c.id === carId),
    updateCarRating,
  };

  return <CarsContext.Provider value={value}>{children}</CarsContext.Provider>;
};

export const useCars = (): CarsContextValue => {
  const ctx = useContext(CarsContext);
  if (!ctx) throw new Error('useCars must be used within a CarsProvider');
  return ctx;
};
