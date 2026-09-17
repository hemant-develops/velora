import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listAllActiveCarSlugs } from "@/lib/queries";
import { buildCarSlug } from "@/lib/slug";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cars = await listAllActiveCarSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "daily", priority: 0.8 },
  ];

  const carRoutes: MetadataRoute.Sitemap = cars.map((car) => ({
    url: `${SITE_URL}/cars/${buildCarSlug(car)}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...carRoutes];
}
