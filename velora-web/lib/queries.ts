import { supabase, isSupabaseConfigured } from './supabase';
import { PublicCar, PublicOwner, SearchFilters } from './types';
import { haversineDistanceKm } from './geo';

// car_listings.brand_id is a plain text column with no foreign key to
// brands.id (see supabase_migration_multidevice.sql -- it predates that
// constraint ever being added), so PostgREST can't auto-embed a join the
// way it can for a real FK. Brands are fetched once and joined in memory
// instead -- exactly the same two-separate-queries shape the mobile app's
// CatalogContext/CarsContext already use for the same reason.
const CAR_COLUMNS =
  'id, owner_id, name, brand_id, category, images, price_per_day, driver_price_per_day, rating, review_count, transmission, fuel_type, seats, features, description, location, latitude, longitude, instant_book, created_at, quantity';

interface CarRow {
  id: string;
  owner_id: string;
  name: string;
  brand_id: string;
  category: string;
  images: string[] | null;
  price_per_day: number;
  driver_price_per_day: number;
  rating: number;
  review_count: number;
  transmission: string;
  fuel_type: string;
  seats: number;
  features: string[] | null;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  instant_book: boolean;
  created_at: string;
  quantity: number | null;
}

interface BrandRow {
  id: string;
  name: string;
}

const getBrandMap = async (): Promise<Map<string, string>> => {
  const { data, error } = await supabase.from('brands').select('id, name');
  if (error) {
    console.error('VELORA_WEB_BRANDS_FETCH_ERROR', error.message);
    return new Map();
  }
  return new Map(((data ?? []) as BrandRow[]).map((b) => [b.id, b.name]));
};

const rowToCar = (row: CarRow, brandName: string): PublicCar => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  brandId: row.brand_id,
  brandName,
  category: row.category,
  images: row.images ?? [],
  pricePerDay: row.price_per_day,
  driverPricePerDay: row.driver_price_per_day,
  rating: Number(row.rating),
  reviewCount: row.review_count,
  transmission: row.transmission,
  fuelType: row.fuel_type,
  seats: row.seats,
  features: row.features ?? [],
  description: row.description,
  location: row.location,
  latitude: row.latitude,
  longitude: row.longitude,
  instantBook: row.instant_book,
  createdAt: row.created_at,
  // Mirrors the mobile app's getCarQuantity() ?? 1 fallback -- a listing
  // created before this field existed simply defaults to a single unit.
  quantity: row.quantity ?? 1,
});

// Text relevance is deliberately simple (substring match, weighted by WHERE
// it matches) rather than full-text search -- this is a small, owner-listed
// marketplace, not a large catalog, so a straightforward scoring pass over
// already-fetched rows is both fast enough and easy to reason about.
const relevanceScore = (car: PublicCar, q: string): number => {
  const needle = q.trim().toLowerCase();
  if (!needle) return 0;
  let score = 0;
  if (car.name.toLowerCase().includes(needle)) score += 3;
  if (car.brandName.toLowerCase().includes(needle)) score += 3;
  if (car.category.toLowerCase().includes(needle)) score += 1;
  if (car.location.toLowerCase().includes(needle)) score += 1;
  return score;
};

export const searchActiveCars = async (filters: SearchFilters): Promise<PublicCar[]> => {
  if (!isSupabaseConfigured) return [];

  let query = supabase.from('car_listings').select(CAR_COLUMNS).eq('is_active', true);

  if (filters.minPrice != null) query = query.gte('price_per_day', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('price_per_day', filters.maxPrice);
  if (filters.seats === '5') query = query.lte('seats', 5);
  if (filters.seats === '7plus') query = query.gte('seats', 7);
  if (filters.location) query = query.ilike('location', `%${filters.location}%`);
  if (filters.features && filters.features.length > 0) query = query.contains('features', filters.features);

  const [{ data, error }, brandMap] = await Promise.all([query, getBrandMap()]);

  if (error) {
    console.error('VELORA_WEB_CARS_SEARCH_ERROR', error.message);
    return [];
  }

  let cars = ((data ?? []) as CarRow[]).map((row) => rowToCar(row, brandMap.get(row.brand_id) ?? 'Other'));

  // A free-text query further narrows AND ranks -- unlike the structured
  // filters above (price/seats/location/features), name/brand text search
  // has no single obviously-correct SQL predicate across two separate
  // tables, so it's applied here once both are already joined in memory.
  if (filters.q && filters.q.trim()) {
    cars = cars.filter((c) => relevanceScore(c, filters.q!) > 0);
  }

  const origin = filters.latitude != null && filters.longitude != null ? { latitude: filters.latitude, longitude: filters.longitude } : null;

  const scored = cars.map((car) => {
    const distanceKm = origin && car.latitude != null && car.longitude != null ? haversineDistanceKm(origin, { latitude: car.latitude, longitude: car.longitude }) : null;
    const relevance = filters.q ? relevanceScore(car, filters.q) : 0;
    // Combined ranking: text relevance dominates (a direct name/brand match
    // should always outrank a merely-nearby or merely-highly-rated car),
    // then rating, then closer distance nudges ahead of farther -- distance
    // is only ever a tiebreaker-ish signal here since most visitors won't
    // have shared their location at all (origin is null in that case).
    const rankScore = relevance * 100 + car.rating * 10 - (distanceKm ?? 0) * 0.1;
    return { car, distanceKm, rankScore };
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);

  return scored.map((s) => s.car);
};

export const getCarDistances = (cars: PublicCar[], origin: { latitude: number; longitude: number } | null): Map<string, number> => {
  const map = new Map<string, number>();
  if (!origin) return map;
  for (const car of cars) {
    if (car.latitude != null && car.longitude != null) {
      map.set(car.id, haversineDistanceKm(origin, { latitude: car.latitude, longitude: car.longitude }));
    }
  }
  return map;
};

export const getCarById = async (id: string): Promise<PublicCar | null> => {
  if (!isSupabaseConfigured) return null;

  const [{ data, error }, brandMap] = await Promise.all([
    supabase.from('car_listings').select(CAR_COLUMNS).eq('id', id).eq('is_active', true).maybeSingle(),
    getBrandMap(),
  ]);

  if (error) {
    console.error('VELORA_WEB_CAR_FETCH_ERROR', error.message);
    return null;
  }
  if (!data) return null;

  const row = data as CarRow;
  return rowToCar(row, brandMap.get(row.brand_id) ?? 'Other');
};

export const getOwnerProfile = async (ownerId: string): Promise<PublicOwner | null> => {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('id', ownerId).maybeSingle();
  if (error) {
    console.error('VELORA_WEB_OWNER_FETCH_ERROR', error.message);
    return null;
  }
  if (!data) return null;

  const row = data as { id: string; full_name: string | null; avatar_url: string | null };
  return { id: row.id, name: row.full_name || 'VELORA Owner', avatar: row.avatar_url };
};

// Sitemap-only: every active car's id/slug material, with no filters and no
// ranking -- deliberately a separate, minimal-column query from
// searchActiveCars above rather than reusing it, since a sitemap needs
// every listing regardless of price/seats/etc. and doesn't need the
// full PublicCar shape for anything but building a URL.
export const listAllActiveCarSlugs = async (): Promise<{ id: string; name: string; brandName: string; location: string }[]> => {
  if (!isSupabaseConfigured) return [];

  const [{ data, error }, brandMap] = await Promise.all([
    supabase.from('car_listings').select('id, name, brand_id, location').eq('is_active', true),
    getBrandMap(),
  ]);

  if (error) {
    console.error('VELORA_WEB_SITEMAP_CARS_ERROR', error.message);
    return [];
  }

  return ((data ?? []) as { id: string; name: string; brand_id: string; location: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
    brandName: brandMap.get(row.brand_id) ?? 'Other',
    location: row.location,
  }));
};

export const getActiveCarsByOwner = async (ownerId: string): Promise<PublicCar[]> => {
  if (!isSupabaseConfigured) return [];

  const [{ data, error }, brandMap] = await Promise.all([
    supabase.from('car_listings').select(CAR_COLUMNS).eq('owner_id', ownerId).eq('is_active', true).order('created_at', { ascending: false }),
    getBrandMap(),
  ]);

  if (error) {
    console.error('VELORA_WEB_OWNER_CARS_FETCH_ERROR', error.message);
    return [];
  }

  return ((data ?? []) as CarRow[]).map((row) => rowToCar(row, brandMap.get(row.brand_id) ?? 'Other'));
};
