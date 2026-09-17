import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getOwnerProfile, getActiveCarsByOwner } from "@/lib/queries";
import { CarCard } from "@/components/CarCard";

type OwnerPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: OwnerPageProps): Promise<Metadata> {
  const { id } = await params;
  const owner = await getOwnerProfile(id);
  if (!owner) return { title: "Owner not found" };
  return {
    title: `${owner.name} — Car Owner on VELORA`,
    description: `Browse rental cars listed by ${owner.name} on VELORA.`,
  };
}

export default async function OwnerPage({ params }: OwnerPageProps) {
  const { id } = await params;
  const owner = await getOwnerProfile(id);
  if (!owner) notFound();

  const cars = await getActiveCarsByOwner(id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100">
          {owner.avatar ? <Image src={owner.avatar} alt={owner.name} fill sizes="64px" className="object-cover" /> : null}
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{owner.name}</h1>
          <p className="text-sm text-neutral-500">
            {cars.length} car{cars.length === 1 ? "" : "s"} listed on VELORA
          </p>
        </div>
      </div>

      {cars.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-sm text-neutral-500">This owner has no active listings right now.</p>
        </div>
      )}
    </div>
  );
}
