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
}

export interface PublicOwner {
  id: string;
  name: string;
  avatar: string | null;
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
