'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { COMMON_FEATURES } from '@/lib/constants';
import { SearchFilters } from '@/lib/types';

interface Props {
  initial?: SearchFilters;
  compact?: boolean;
}

// The ONE search form used both on the homepage (compact=false, big hero
// treatment) and pinned atop the Search Results page (compact=true, prefilled
// from the URL) -- same fields, same submit behavior, so criteria entered on
// the homepage carries forward exactly as-is when the person lands on
// /search: everything here is encoded into the URL's query string rather
// than kept in memory, which is also what makes a search result shareable/
// bookmarkable and crawlable by Google.
export const SearchForm: React.FC<Props> = ({ initial, compact }) => {
  const router = useRouter();
  const [q, setQ] = useState(initial?.q ?? '');
  const [seats, setSeats] = useState<SearchFilters['seats'] | 'any'>(initial?.seats ?? 'any');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [transmission, setTransmission] = useState(initial?.transmission ?? '');
  const [fuelType, setFuelType] = useState(initial?.fuelType ?? '');
  const [instantBook, setInstantBook] = useState(initial?.instantBook ?? false);
  const [minPrice, setMinPrice] = useState(initial?.minPrice ? String(initial.minPrice) : '');
  const [maxPrice, setMaxPrice] = useState(initial?.maxPrice ? String(initial.maxPrice) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);

  const toggleFeature = (f: string) => {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (seats && seats !== 'any') params.set('seats', seats);
    if (category) params.set('category', category);
    if (transmission) params.set('transmission', transmission);
    if (fuelType) params.set('fuelType', fuelType);
    if (instantBook) params.set('instantBook', 'true');
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (location.trim()) params.set('location', location.trim());
    if (features.length > 0) params.set('features', features.join(','));
    router.push(`/search?${params.toString()}`);
  };

  return (
    <form onSubmit={onSubmit} className="w-full rounded-2xl bg-white p-4 shadow-lg shadow-black/5 ring-1 ring-black/5 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">Car name or brand</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Swift, Creta, Innova"
            className="h-11 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">Location</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Kota, Jaipur"
            className="h-11 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">Seats</span>
          <select
            value={seats}
            onChange={(e) => setSeats(e.target.value as SearchFilters['seats'] | 'any')}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="any">Any</option>
            <option value="5">5 Seater</option>
            <option value="7plus">7 / 8 Seater</option>
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">Budget per day (₹)</span>
          <div className="flex h-11 items-center gap-2">
            <input
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min"
              className="h-11 w-full min-w-0 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
            />
            <span className="shrink-0 text-neutral-400">–</span>
            <input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max"
              className="h-11 w-full min-w-0 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>

        <SelectField label="Category" value={category} onChange={setCategory} options={['Economy', 'Hatchback', 'Sedan', 'SUV', 'MUV', 'Premium', 'Luxury Sedan', 'Sports Car', 'Convertible', 'Electric']} />
        <SelectField label="Transmission" value={transmission} onChange={setTransmission} options={['Automatic', 'Manual']} />
        <SelectField label="Fuel" value={fuelType} onChange={setFuelType} options={['Petrol', 'Diesel', 'Electric', 'Hybrid']} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-neutral-700">
          <input type="checkbox" checked={instantBook} onChange={(e) => setInstantBook(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          Instant Book only
        </label>
      </div>

      {!compact ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {COMMON_FEATURES.map((f) => {
            const selected = features.includes(f);
            return (
              <button
                type="button"
                key={f}
                onClick={() => toggleFeature(f)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="submit"
        className="mt-4 h-11 w-full rounded-lg bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 sm:w-auto sm:px-8"
      >
        Search Cars
      </button>
    </form>
  );
};

const SelectField: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: string[] }> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-neutral-700">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30">
      <option value="">Any</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);
