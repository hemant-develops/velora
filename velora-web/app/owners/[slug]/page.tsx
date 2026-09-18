import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getOwnerStoreBySlug, getActiveCarsByOwner } from "@/lib/queries";
import { CarCard } from "@/components/CarCard";
import { Rating } from "@/components/Rating";
import { SITE_URL } from "@/lib/site";

type OwnerPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: OwnerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = await getOwnerStoreBySlug(slug);
  if (!store) return { title: "Store not found" };
  return {
    title: store.storeName,
    description: store.description || `${store.storeName} — rental cars listed on VELORA.`,
    alternates: { canonical: `/owners/${store.slug}` },
  };
}

export default async function OwnerPage({ params }: OwnerPageProps) {
  const { slug } = await params;
  const store = await getOwnerStoreBySlug(slug);
  if (!store) notFound();

  const cars = await getActiveCarsByOwner(store.ownerId);

  // STRUCTURED DATA -- schema.org LocalBusiness, the closest honest fit for
  // a car-rental storefront (Google has no dedicated "digital storefront"
  // type). Every value is read straight from the real store row; policies/
  // description are omitted from markup entirely when the owner hasn't
  // written any, never replaced with placeholder text.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: store.storeName,
    description: store.description || undefined,
    image: store.ownerAvatar || undefined,
    url: `${SITE_URL}/owners/${store.slug}`,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100">
            {store.ownerAvatar ? <Image src={store.ownerAvatar} alt={store.storeName} fill sizes="64px" className="object-cover" /> : null}
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{store.storeName}</h1>
            <p className="text-sm text-neutral-500">
              By {store.ownerName} · {cars.length} car{cars.length === 1 ? "" : "s"} listed on VELORA
            </p>
            <div className="mt-2">
              <Rating rating={store.rating} reviewCount={store.reviewCount} />
            </div>
          </div>
        </div>

        {store.description ? <p className="mt-4 text-sm leading-relaxed text-neutral-600">{store.description}</p> : null}

        {store.policies ? (
          <div className="mt-4 rounded-xl bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Policies</p>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">{store.policies}</p>
          </div>
        ) : null}
      </div>

      {cars.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-sm text-neutral-500">This store has no active listings right now.</p>
        </div>
      )}
    </div>
  );
}
