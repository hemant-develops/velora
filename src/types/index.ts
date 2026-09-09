export type FuelType = 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid' | 'CNG';
export type Transmission = 'Automatic' | 'Manual';
export type CarCategory =
  | 'Economy'
  | 'Hatchback'
  | 'Sedan'
  | 'SUV'
  | 'MUV'
  | 'Premium'
  | 'Luxury Sedan'
  | 'Sports Car'
  | 'Convertible'
  | 'Electric';

export type RentalMode = 'self_drive' | 'with_driver';

export interface Brand {
  id: string;
  name: string;
  logo: string;
}

export interface Car {
  id: string;
  name: string;
  brandId: string;
  category: CarCategory;
  images: string[];
  pricePerDay: number;
  driverPricePerDay: number;
  rating: number;
  reviewCount: number;
  topSpeed: number; // km/h
  transmission: Transmission;
  fuelType: FuelType;
  fuelEconomy: string; // e.g. "18 km/l" or "6 km/kWh"
  seats: number;
  features: string[];
  description: string;
  discountPercent?: number;
  location: string;
  ownerId: string;
  rentalModes: RentalMode[];
  // Manufacturing year. Optional so cars listed before this field existed
  // don't break — the UI simply omits the year when it's absent.
  year?: number;
  // Owner-controlled visibility. undefined/true = visible in search/listing
  // and bookable; false = hidden from renters entirely (search, favorites,
  // recommendations) but the owner can still see and manage it, and any
  // existing booking on it is left completely untouched. Defaulting missing
  // values to "active" means every listing created before this field
  // existed stays visible with no migration step.
  isActive?: boolean;
}

export type UserRole = 'renter' | 'owner';

export interface OwnerVerification {
  status: 'none' | 'verified';
  fullName?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  verifiedAt?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  // Real, persisted signup timestamp -- used to show "Member since" on the
  // owner public profile. Never fabricated for accounts that predate this
  // field (they simply omit the row rather than showing a guessed date).
  createdAt?: string;
  // Optional free-text "About" shown on the owner public profile. Empty/
  // unset renders as "Not added yet", never a fake bio.
  bio?: string;
  // Empty string means "not set yet" -- a brand-new account starts with no
  // assumed location at all (no hardcoded city/country). `locationSource`
  // records how the current value was obtained, purely so the UI can show
  // "Current location" vs "Manually set" -- it never affects behavior.
  location: string;
  locationSource?: 'gps' | 'manual';
  avatar: string;
  role: UserRole;
  // A renter can only ever flip into Owner Mode once this is 'verified' —
  // set the moment someone signs up (or creates a brand-new account at
  // login) choosing "List My Car" directly, or after they complete the
  // one-time Owner Verification form from Profile. This stops a casual
  // renter from tapping their way into owner mode and listing fake cars.
  ownerVerification?: OwnerVerification;
}

// Real booking lifecycle: every new booking starts 'pending' until the
// owner explicitly Confirms (-> 'upcoming') or Rejects (-> 'rejected') it.
// A confirmed booking then moves 'upcoming' -> 'active' -> 'completed' as
// the owner marks progress, or either side can end it early as 'cancelled'
// before it starts. This is the single source of truth for status — every
// screen renders from this, nothing infers status from dates.
export type BookingStatus = 'pending' | 'upcoming' | 'active' | 'completed' | 'cancelled' | 'rejected';

export interface Booking {
  id: string;
  carId: string;
  renterId: string;
  rentalMode: RentalMode;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string; // ISO date
  dropoffDate: string; // ISO date
  pickupTime: string;
  dropoffTime: string;
  days: number;
  subtotal: number;
  taxes: number;
  serviceFee: number;
  total: number;
  paymentMethod: string;
  status: BookingStatus;
  createdAt: string;
  agreementSignedBy: string;
  agreementSignedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

// A conversation is always between one specific renter and one specific
// owner about one specific car — there is no generic "support" inbox. It
// only starts existing (and only then becomes visible to the owner) the
// moment the renter sends its first real message.
export interface Conversation {
  id: string;
  carId: string;
  carName: string;
  renterId: string;
  renterName: string;
  renterAvatar: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
  messages: ChatMessage[];
  lastMessage: string;
  lastMessageAt: string;
  unreadForRenter: number;
  unreadForOwner: number;
}

export interface Review {
  id: string;
  bookingId: string;
  carId: string;
  renterId: string;
  renterName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// Local notification system -- generated only from real events already
// happening elsewhere in the app (a booking being created/changing status,
// a new chat message). Never fabricated/seeded content.
export type NotificationType = 'booking_created' | 'booking_status' | 'message';
export type NotificationTargetKind = 'car' | 'conversation' | 'booking';

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id: string; // carId, conversationId, or bookingId, matching the existing route params
}

export interface AppNotification {
  id: string;
  userId: string; // the recipient
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  target?: NotificationTarget;
}

export interface FilterState {
  brandIds: string[];
  minPrice: number;
  maxPrice: number;
  transmission: Transmission | 'Any';
  fuelType: FuelType | 'Any';
  category: CarCategory | 'Any';
  rentalMode: RentalMode | 'Any';
  seats: number | 'Any';
}
