import Image from 'next/image';
import Link from 'next/link';
import { PublicCar } from '@/lib/types';
import { buildCarSlug } from '@/lib/slug';
import { formatCurrency, formatDistanceKm } from '@/lib/format';
import { Rating } from './Rating';

interface Props {
  car: PublicCar;
  distanceKm?: number;
}

export const CarCard: React.FC<Props> = ({ car, distanceKm }) => {
  const city = car.location.split(',')[0]?.trim();

  return (
    <Link
      href={`/cars/${buildCarSlug(car)}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 transition-shadow hover:shadow-lg hover:shadow-black/10"
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100">
        {car.images[0] ? (
          <Image
            src={car.images[0]}
            alt={`${car.brandName} ${car.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">No photo</div>
        )}
        {car.instantBook ? (
          <span className="absolute left-3 top-3 rounded-full bg-neutral-900/85 px-2.5 py-1 text-[11px] font-semibold text-white">Instant Book</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-500">{car.brandName}</p>
            <h3 className="truncate text-base font-semibold text-neutral-900">{car.name}</h3>
          </div>
          <Rating rating={car.rating} reviewCount={car.reviewCount} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
          <span>{car.seats} Seats</span>
          <span aria-hidden>•</span>
          <span>{car.transmission}</span>
          <span aria-hidden>•</span>
          <span>{car.fuelType}</span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-neutral-500">{distanceKm != null ? formatDistanceKm(distanceKm) : city}</p>
            <p className="text-lg font-bold text-neutral-900">
              {formatCurrency(car.pricePerDay)}
              <span className="text-xs font-normal text-neutral-500"> / day</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};
