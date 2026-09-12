import { Car } from '../types';

// M10 -- shared between HomeScreen and FavoritesScreen so "sorting" behaves
// identically everywhere a renter sees a list of cars, instead of each
// screen growing its own slightly-different copy. Extracted from
// HomeScreen's existing sort logic (M7) rather than inventing a new scheme.
export type SortKey = 'recommended' | 'price_low' | 'price_high' | 'rating' | 'newest';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_low', label: 'Price: Low to High' },
  { key: 'price_high', label: 'Price: High to Low' },
  { key: 'rating', label: 'Top Rated' },
  { key: 'newest', label: 'Newest' },
];

// 'recommended' returns the input order unchanged (whatever order the
// caller's own filtering already produced) -- every other key returns a
// new, sorted array so the caller's original list is never mutated.
export const sortCars = (cars: Car[], sortBy: SortKey): Car[] => {
  if (sortBy === 'recommended') return cars;
  const sorted = [...cars];
  if (sortBy === 'price_low') sorted.sort((a, b) => a.pricePerDay - b.pricePerDay);
  else if (sortBy === 'price_high') sorted.sort((a, b) => b.pricePerDay - a.pricePerDay);
  else if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
  else if (sortBy === 'newest') {
    sorted.sort(
      (a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0),
    );
  }
  return sorted;
};
