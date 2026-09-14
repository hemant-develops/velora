import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { brands } from '../data/brands';
import { supabase } from '../lib/supabase';
import { getCarQuantity } from '../utils/inventory';
import { Car, FilterState } from '../types';

// MULTI-DEVICE MIGRATION -- the car catalog used to live only in this
// device's AsyncStorage (`velora.ownerCars.v1`), which meant a car an owner
// listed on their phone was invisible to every renter on every other phone.
// It now lives in the real, shared `public.car_listings` table (see
// supabase_migration_multidevice.sql) with RLS: anyone signed in can read a
// car with `is_active = true`, and an owner can additionally read/write
// their OWN cars regardless of active state. `public.local_car_inventory`
// and its three RPCs (sync_local_car_inventory / create_local_car_booking_hold
// / set_local_car_booking_hold_status) are completely UNCHANGED -- they
// remain the one and only source of truth for booking availability. This
// file only changes WHERE the rich listing data (name/photos/price/
// description/...) is read from and written to.

export const defaultFilters: FilterState = {
  brandIds: [],
  minPrice: 0,
  maxPrice: 40000,
  transmission: 'Any',
  fuelType: 'Any',
  category: 'Any',
  rentalMode: 'Any',
  seats: 'Any',
  availableOnly: false,
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
  // Pushes `car`'s current quantity into Supabase's local inventory
  // ledger (public.local_car_inventory, keyed directly by this app's own
  // car.id -- see sync_local_car_inventory) so create_local_car_booking_hold
  // has a row to read. Throws if Supabase is unreachable / the RPC fails --
  // callers (BookingsContext) must not silently proceed as if it succeeded.
  syncCarInventory: (car: Car) => Promise<void>;
  // New -- lets a screen force a re-pull of the shared catalog (e.g. a
  // pull-to-refresh), on top of the automatic refetch this context already
  // does after every local mutation and on realtime change notifications.
  refreshCars: () => Promise<void>;
}

const CarsContext = createContext<CarsContextValue | undefined>(undefined);

interface CarRow {
  id: string;
  owner_id: string;
  name: string;
  brand_id: string;
  model_id: string | null;
  category: string;
  images: string[];
  price_per_day: number;
  driver_price_per_day: number;
  rating: number;
  review_count: number;
  top_speed: number;
  transmission: string;
  fuel_type: string;
  fuel_economy: string;
  seats: number;
  features: string[];
  description: string;
  discount_percent: number | null;
  location: string;
  rental_modes: string[];
  year: number | null;
  is_active: boolean;
  quantity: number;
  created_at: string;
}

const rowToCar = (row: CarRow): Car => ({
  id: row.id,
  name: row.name,
  brandId: row.brand_id,
  modelId: row.model_id ?? undefined,
  category: row.category as Car['category'],
  images: row.images ?? [],
  pricePerDay: row.price_per_day,
  driverPricePerDay: row.driver_price_per_day,
  rating: Number(row.rating),
  reviewCount: row.review_count,
  topSpeed: row.top_speed,
  transmission: row.transmission as Car['transmission'],
  fuelType: row.fuel_type as Car['fuelType'],
  fuelEconomy: row.fuel_economy,
  seats: row.seats,
  features: row.features ?? [],
  description: row.description,
  discountPercent: row.discount_percent ?? undefined,
  location: row.location,
  ownerId: row.owner_id,
  rentalModes: (row.rental_modes ?? ['self_drive']) as Car['rentalModes'],
  year: row.year ?? undefined,
  isActive: row.is_active,
  quantity: row.quantity,
  createdAt: row.created_at,
});

// PRODUCTION-AUDIT FIX -- every one of these columns is a Postgres `integer`
// (see supabase_migration_multidevice.sql's car_listings table). OwnerAddCar
// Screen's numeric text inputs use a numeric keyboard, but that keyboard
// still allows a decimal point on Android/iOS, and `Number("180.5")` passes
// straight through as 180.5 with nothing else in this codebase catching it.
// Sending a fractional value into an `integer` column is rejected by
// Postgres, and that rejection surfaced through onSubmit's catch block as
// the same generic "we couldn't save your changes right now" -- indistin-
// guishable from a real network/auth failure with no way to tell them
// apart. Rounding here, at the single choke point every save/create goes
// through, removes that failure mode for every caller, not just this
// screen's current inputs.
const carToRow = (car: Car) => ({
  id: car.id,
  owner_id: car.ownerId,
  name: car.name,
  brand_id: car.brandId,
  model_id: car.modelId ?? null,
  category: car.category,
  images: car.images,
  price_per_day: Math.round(car.pricePerDay),
  driver_price_per_day: Math.round(car.driverPricePerDay),
  rating: car.rating,
  review_count: car.reviewCount,
  top_speed: Math.round(car.topSpeed),
  transmission: car.transmission,
  fuel_type: car.fuelType,
  fuel_economy: car.fuelEconomy,
  seats: Math.round(car.seats),
  features: car.features,
  description: car.description,
  discount_percent: car.discountPercent != null ? Math.round(car.discountPercent) : null,
  location: car.location,
  rental_modes: car.rentalModes,
  year: car.year != null ? Math.round(car.year) : null,
  is_active: car.isActive !== false,
  quantity: Math.round(getCarQuantity(car)),
});

export const CarsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The renter-facing marketplace is sourced ENTIRELY from cars that real
  // owners have listed through the app's "List My Car" flow. There is no
  // hardcoded/demo catalog mixed in — a brand-new install genuinely starts
  // with an empty marketplace, and a car only ever appears here the moment
  // an owner account publishes it.
  const [allCars, setAllCars] = useState<Car[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  // Guards a fetch that resolves after a newer one has already started (e.g.
  // a fast login/logout/login) from overwriting fresher data with stale data.
  const fetchTokenRef = useRef(0);

  const fetchCars = async () => {
    const token = ++fetchTokenRef.current;
    try {
      // RLS on car_listings already returns exactly the right set for
      // whoever is currently signed in: every active car (the public
      // marketplace) plus this user's own cars even if inactive (so an
      // owner still sees/manages their own hidden listings) -- see
      // supabase_migration_multidevice.sql's car_listings_select policy.
      const { data, error } = await supabase.from('car_listings').select('*').order('created_at', { ascending: false });
      if (fetchTokenRef.current !== token) return; // a newer fetch already won
      if (error) {
        console.log(`VELORA_CAR_LISTINGS_FETCH_ERROR: ${error.message}`);
        return;
      }
      setAllCars(((data ?? []) as CarRow[]).map(rowToCar));
    } catch (error) {
      if (fetchTokenRef.current !== token) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_CAR_LISTINGS_FETCH_FAILED: ${message}`);
    } finally {
      if (fetchTokenRef.current === token) setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchCars();
    // Refetch whenever this device's auth session changes (sign in/out,
    // token refresh after a long background period) -- RLS means a
    // different signed-in user can legitimately see a different set of
    // rows (their own inactive cars), and a signed-out state should clear
    // back to nothing rather than keep showing the previous user's cars.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchCars();
    });
    // Live updates -- another user listing/editing/hiding a car shows up on
    // this device without needing to background/foreground the app.
    const channel = supabase
      .channel('car_listings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'car_listings' }, () => {
        fetchCars();
      })
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const syncCarInventory = async (car: Car): Promise<void> => {
    const quantity = getCarQuantity(car);
    const { error } = await supabase.rpc('sync_local_car_inventory', {
      p_local_car_id: car.id,
      p_quantity: quantity,
    });
    if (error) {
      console.log(
        `VELORA_LOCAL_CAR_INVENTORY_SYNC_ERROR car=${car.id} quantity=${quantity} ` +
          JSON.stringify({ message: error.message, details: error.details, hint: error.hint, code: error.code }),
      );
      throw new Error(error.message);
    }
  };

  const addOwnerCar = async (car: Car) => {
    const { error } = await supabase.from('car_listings').insert(carToRow(car));
    if (error) {
      console.log(`VELORA_CAR_LISTINGS_INSERT_ERROR: ${error.message}`);
      throw new Error(error.message);
    }
    setAllCars((prev) => [car, ...prev]);
    // Fire-and-forget, same as before -- a slow/unreachable network for the
    // quantity mirror shouldn't block the listing itself from appearing.
    syncCarInventory(car).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_SUPABASE_CAR_SYNC_FAILED: ${message}`);
    });
  };

  const updateOwnerCar = async (carId: string, patch: Partial<Car>) => {
    const current = allCars.find((c) => c.id === carId);
    // PRODUCTION-AUDIT FIX -- this used to silently `return` here, which let
    // OwnerAddCarScreen's onSubmit fall through to "Changes saved" / navigate
    // back as if the update had actually happened, when nothing was ever
    // sent to Supabase. Throwing surfaces it as a real, visible failure
    // instead of a false success the owner would only discover later by
    // finding their edit never took effect.
    if (!current) throw new Error("This car couldn't be found. Pull to refresh and try again.");
    const updated: Car = { ...current, ...patch };
    const { error } = await supabase.from('car_listings').update(carToRow(updated)).eq('id', carId);
    if (error) {
      console.log(`VELORA_CAR_LISTINGS_UPDATE_ERROR: ${error.message}`);
      throw new Error(error.message);
    }
    setAllCars((prev) => prev.map((c) => (c.id === carId ? updated : c)));
    syncCarInventory(updated).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_SUPABASE_CAR_SYNC_FAILED: ${message}`);
    });
  };

  const removeOwnerCar = async (carId: string) => {
    // A real delete now that the listing lives centrally -- the matching
    // local_car_inventory row (if any) is left exactly as it was before,
    // same as the previous local-only behavior.
    const { error } = await supabase.from('car_listings').delete().eq('id', carId);
    if (error) {
      console.log(`VELORA_CAR_LISTINGS_DELETE_ERROR: ${error.message}`);
      throw new Error(error.message);
    }
    setAllCars((prev) => prev.filter((c) => c.id !== carId));
  };

  // Recomputes a car's average rating using a simple running-average formula
  // (previous average weighted by its review count, plus the new rating),
  // then persists the updated car back into the shared table so every
  // device sees the new rating, not just this one.
  const updateCarRating = async (carId: string, newRating: number) => {
    const current = allCars.find((c) => c.id === carId);
    if (!current) return;
    const nextCount = current.reviewCount + 1;
    const nextRating = Math.round(((current.rating * current.reviewCount + newRating) / nextCount) * 10) / 10;
    const updated: Car = { ...current, rating: nextRating, reviewCount: nextCount };
    const { error } = await supabase
      .from('car_listings')
      .update({ rating: nextRating, review_count: nextCount })
      .eq('id', carId);
    if (error) {
      console.log(`VELORA_CAR_LISTINGS_RATING_ERROR: ${error.message}`);
      return;
    }
    setAllCars((prev) => prev.map((c) => (c.id === carId ? updated : c)));
  };

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
        const haystack = `${car.name} ${brandNameOf(car.brandId)} ${car.category} ${car.location}`.toLowerCase();
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
    if (filters.availableOnly) count += 1;
    return count;
  }, [filters]);

  const value = useMemo<CarsContextValue>(
    () => ({
      // Public-facing list: active cars only (search, Home, Favorites, ...).
      // Owner-scoped lookups below intentionally read from `allCars`
      // instead, so an owner always sees and can manage every one of their
      // own cars — active or not — and any existing car/booking detail
      // route keeps resolving even after the car is toggled inactive.
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
      syncCarInventory,
      refreshCars: fetchCars,
    }),
    [isLoaded, searchQuery, filters, activeCars, allCars, filteredCars, activeFilterCount],
  );

  return <CarsContext.Provider value={value}>{children}</CarsContext.Provider>;
};

export const useCars = (): CarsContextValue => {
  const ctx = useContext(CarsContext);
  if (!ctx) throw new Error('useCars must be used within a CarsProvider');
  return ctx;
};
