import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCarById, getOwnerStoreBySlug } from "@/lib/queries";
import { parseCarIdFromSlug, buildCarSlug } from "@/lib/slug";
import { formatCurrency } from "@/lib/format";
import { Rating } from "@/components/Rating";
import { PLAY_STORE_URL } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

type CarPageProps = {
  params: Promise<{ slug: string }>;
};

const loadCar = async (slug: string) => {
  const id = parseCarIdFromSlug(slug);
  if (!id) return null;
  return getCarById(id);
};

export async function generateMetadata({ params }: CarPageProps): Promise<Metadata> {
  const { slug } = await params;
  const car = await loadCar(slug);
  if (!car) return { title: "Car not found" };

  const city = car.location.split(",")[0]?.trim();
  const title = `${car.brandName} ${car.name} for rent${city ? ` in ${city}` : ""}`;
  const description = `Rent the ${car.brandName} ${car.name}${city ? ` in ${city}` : ""} for ${formatCurrency(car.pricePerDay)}/day. ${car.seats} seats, ${car.transmission}, ${car.fuelType}. Listed by a real VELORA owner.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: car.images[0] ? [{ url: car.images[0] }] : undefined,
    },
    // A stable canonical based on the real id -- the human-readable prefix
    // is cosmetic (see lib/slug.ts), so this stops a listing that gets
    // renamed/relocated from generating a second, competing indexable URL
    // for the same car.
    alternates: { canonical: `/cars/${buildCarSlug(car)}` },
  };
}

export default async function CarPage({ params }: CarPageProps) {
  const { slug } = await params;
  const car = await loadCar(slug);
  if (!car) notFound();

  const store = car.ownerStoreSlug ? await getOwnerStoreBySlug(car.ownerStoreSlug) : null;
  const city = car.location.split(",")[0]?.trim();

  // STRUCTURED DATA -- schema.org Product + Offer (Google has no dedicated
  // "car rental listing" rich-result type, but Product/Offer/AggregateRating
  // are the widely-supported, honest fit: every value here is read straight
  // from the same real row the visible page renders, never invented for the
  // sake of richer markup -- aggregateRating is omitted entirely rather than
  // faked when this car has zero real reviews yet.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${car.brandName} ${car.name}`,
    image: car.images,
    description: car.description || `${car.brandName} ${car.name} available for rent in ${city || car.location}.`,
    brand: { "@type": "Brand", name: car.brandName },
    ...(car.reviewCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: car.rating, reviewCount: car.reviewCount } }
      : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: car.pricePerDay,
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/cars/${buildCarSlug(car)}`,
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* JSON.stringify of our own server-computed object above, never
          user-supplied HTML. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-neutral-500">
        <Link href="/search" className="hover:text-neutral-900">
          Browse Cars
        </Link>
        <span className="mx-1.5" aria-hidden>
          /
        </span>
        <span className="text-neutral-700">
          {car.brandName} {car.name}
        </span>
      </nav>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:grid-cols-4">
            {car.images.length > 0 ? (
              car.images.slice(0, 4).map((src, i) => (
                <div key={src} className={`relative aspect-[4/3] bg-neutral-100 ${i === 0 ? "col-span-2 row-span-2 sm:col-span-2 sm:row-span-2" : ""}`}>
                  <Image src={src} alt={`${car.brandName} ${car.name} photo ${i + 1}`} fill sizes="50vw" className="object-cover" priority={i === 0} />
                </div>
              ))
            ) : (
              <div className="col-span-2 flex aspect-[16/9] items-center justify-center bg-neutral-100 text-sm text-neutral-400 sm:col-span-4">
                No photos yet
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-neutral-500">{car.brandName}</p>
            <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{car.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
              <Rating rating={car.rating} reviewCount={car.reviewCount} size="md" />
              <span aria-hidden>•</span>
              <span>{city || car.location}</span>
              <span aria-hidden>•</span>
              <span className="font-medium text-emerald-700">
                {car.quantity > 1 ? `Available for booking · ${car.quantity} units` : "Available for booking"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:grid-cols-4">
            <Spec label="Seats" value={String(car.seats)} />
            <Spec label="Transmission" value={car.transmission} />
            <Spec label="Fuel" value={car.fuelType} />
            <Spec label="Category" value={car.category} />
          </div>

          {car.description ? (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-neutral-900">About this car</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{car.description}</p>
            </div>
          ) : null}

          {car.features.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-neutral-900">Features</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {car.features.map((f) => (
                  <span key={f} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {store ? (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-neutral-900">Listed by</h2>
              <Link href={`/owners/${store.slug}`} className="mt-2 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 transition-colors hover:ring-neutral-300">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  {store.ownerAvatar ? <Image src={store.ownerAvatar} alt={store.storeName} fill sizes="44px" className="object-cover" /> : null}
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{store.storeName}</p>
                  <p className="text-xs text-neutral-500">View store</p>
                </div>
              </Link>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <p className="text-2xl font-bold text-neutral-900">
              {formatCurrency(car.pricePerDay)}
              <span className="text-sm font-normal text-neutral-500"> / day</span>
            </p>
            {car.driverPricePerDay > 0 ? (
              <p className="mt-1 text-xs text-neutral-500">With driver: {formatCurrency(car.driverPricePerDay)} / day</p>
            ) : null}

            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block w-full rounded-lg bg-neutral-900 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              Book Now
            </a>
            <p className="mt-2 text-center text-xs text-neutral-500">Booking is available through the VELORA app.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const Spec: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    <p className="text-sm font-semibold text-neutral-900">{value}</p>
  </div>
);
