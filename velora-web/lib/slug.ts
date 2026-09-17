import { PublicCar } from './types';

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// A car's SEO url looks like /cars/maruti-suzuki-swift-kota--car-m4x2z1-ab12cd
// -- a human-readable, keyword-rich prefix (brand, model, city -- exactly
// what "Maruti Suzuki Swift for rent in Kota" search intent needs) followed
// by `--` and the car's REAL id in full. The prefix is cosmetic/for SEO only
// and is never trusted for lookup; parseCarIdFromSlug below always resolves
// the exact row from the id after the last `--`, so a stale bookmark from
// before a listing's name/city changed still resolves correctly instead of
// 404ing.
export const buildCarSlug = (car: Pick<PublicCar, 'id' | 'name' | 'brandName' | 'location'>): string => {
  const city = car.location.split(',')[0]?.trim() ?? '';
  const humanPart = slugify(`${car.brandName} ${car.name} ${city}`) || 'car';
  return `${humanPart}--${car.id}`;
};

export const parseCarIdFromSlug = (slug: string): string | null => {
  const idx = slug.lastIndexOf('--');
  if (idx === -1) return null;
  const id = slug.slice(idx + 2);
  return id || null;
};
