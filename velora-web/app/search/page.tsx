import type { Metadata } from "next";
import { SearchForm } from "@/components/SearchForm";
import { CarCard } from "@/components/CarCard";
import { searchActiveCars, getCarDistances } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SearchFilters } from "@/lib/types";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const parseFilters = (params: Record<string, string | string[] | undefined>): SearchFilters => {
  const q = first(params.q);
  const seatsRaw = first(params.seats);
  const category = first(params.category);
  const transmission = first(params.transmission);
  const fuelType = first(params.fuelType);
  const instantBookRaw = first(params.instantBook);
  const minPrice = first(params.minPrice);
  const maxPrice = first(params.maxPrice);
  const location = first(params.location);
  const featuresRaw = first(params.features);
  const lat = first(params.lat);
  const lng = first(params.lng);

  return {
    q: q || undefined,
    seats: seatsRaw === "5" || seatsRaw === "7plus" ? seatsRaw : undefined,
    category: category || undefined,
    transmission: transmission || undefined,
    fuelType: fuelType || undefined,
    instantBook: instantBookRaw === 'true' ? true : undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    location: location || undefined,
    features: featuresRaw ? featuresRaw.split(",").filter(Boolean) : undefined,
    latitude: lat ? Number(lat) : undefined,
    longitude: lng ? Number(lng) : undefined,
  };
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const parts = [filters.q, filters.location ? `in ${filters.location}` : undefined].filter(Boolean);
  const title = parts.length > 0 ? `${parts.join(" ")} — Rental Cars` : "Browse Rental Cars";
  return {
    title,
    description: "Compare rental cars listed by real owners on VELORA — price, seats, features, ratings and location, all in one place.",
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const filters = parseFilters(await searchParams);
  const cars = await searchActiveCars(filters);
  const origin = filters.latitude != null && filters.longitude != null ? { latitude: filters.latitude, longitude: filters.longitude } : null;
  const distances = getCarDistances(cars, origin);

  const heading = filters.q
    ? `Results for "${filters.q}"${filters.location ? ` in ${filters.location}` : ""}`
    : filters.location
      ? `Cars for rent in ${filters.location}`
      : "Browse Rental Cars";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SearchForm initial={filters} compact />

      <div className="mt-8 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">{heading}</h1>
        <p className="text-sm text-neutral-500">{cars.length} car{cars.length === 1 ? "" : "s"} found</p>
      </div>

      {!isSupabaseConfigured ? (
        <div className="mt-10 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-sm text-neutral-500">Search is temporarily unavailable. Please try again shortly.</p>
        </div>
      ) : cars.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-base font-semibold text-neutral-900">No cars matched your search</p>
          <p className="mt-1 text-sm text-neutral-500">Try widening your budget, seats or location.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} distanceKm={distances.get(car.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
