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
  // How many identical physical units this one listing represents (an owner
  // with 3 identical Swifts lists them once with quantity 3 instead of 3
  // separate listings -- see the mobile app's Car.quantity). Shown on the
  // car page so "Available for booking" is honest about there being more
  // than one unit, never fabricated beyond what the owner actually set.
  quantity: number;
<<<<<<< HEAD
}

export interface PublicOwner {
  id: string;
  name: string;
  avatar: string | null;
=======
  // The owner's store slug, when they have one (see PublicStore below) --
  // null for a subscribed-but-store-not-yet-provisioned edge case (should
  // be rare: ensureOwnerStore creates one automatically on first
  // subscription) or if the lookup itself failed. The car page's "Listed
  // by" link is simply omitted rather than shown broken when this is null.
  ownerStoreSlug: string | null;
}

// A subscribed owner's public storefront (0028_owner_stores.sql) -- has its
// own identity (store_name, slug, description, policies) an owner sets
// deliberately, separate from their personal profile name/avatar.
export interface PublicStore {
  ownerId: string;
  storeName: string;
  slug: string;
  description: string;
  policies: string;
  ownerName: string;
  ownerAvatar: string | null;
>>>>>>> claude/velora-git-supabase-workflow-550a70
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
