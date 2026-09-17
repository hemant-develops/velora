export interface PublicCar {
  id: string;
  ownerId: string;
  name: string;
  brandId: string;
  brandName: string;
  category: string;
  images: string[];
  pricePerDay: number;
  driverPricePerDay: number;
  rating: number;
  reviewCount: number;
  transmission: string;
  fuelType: string;
  seats: number;
  features: string[];
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  instantBook: boolean;
  createdAt: string;

  // How many identical physical units this listing represents.
  quantity: number;

  // Public storefront slug for the owner, when available.
  ownerStoreSlug: string | null;
}

export interface PublicOwner {
  id: string;
  name: string;
  avatar: string | null;
}

// A subscribed owner's public storefront.
export interface PublicStore {
  ownerId: string;
  storeName: string;
  slug: string;
  description: string;
  policies: string;
  ownerName: string;
  ownerAvatar: string | null;
}

export interface SearchFilters {
  q?: string;
  seats?: '5' | '7plus';
  minPrice?: number;
  maxPrice?: number;
  features?: string[];
  location?: string;
  latitude?: number;
  longitude?: number;
}
