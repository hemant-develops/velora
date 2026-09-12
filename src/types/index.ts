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
  // How many identical physical units this single listing represents (e.g.
  // an owner with 3 identical Swifts lists them once with quantity 3
  // instead of 3 separate listings). undefined defaults to 1 via
  // getCarQuantity()
  // (src/utils/format.ts) so every listing created before this field
  // existed keeps working with no migration step. Availability for a given
  // date range is quantity minus however many overlapping bookings already
  // hold a unit for those dates -- see BookingsContext.getAvailableQuantity.
  quantity?: number;
  // M7 -- set once, at creation, to the real device timestamp; never backfilled
  // or touched again on edit. Only consumer is Home's "Newest" sort. Optional
  // so listings created before this field existed keep working (they simply
  // sort as oldest, via a 0 fallback, rather than breaking the sort).
  createdAt?: string;
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

// M10 -- payment state is tracked SEPARATELY from booking.status (see
// BookingStatus above): a booking's rental lifecycle (pending/confirmed/
// active/...) and whether it's been paid for are two different questions,
// and conflating them was the actual gap M10 closes (previously the app
// only recorded the chosen METHOD, never whether payment actually
// succeeded). 'unpaid' also covers Cash/Pay Later, which is never charged
// through the app at all -- see src/lib/paymentGateway.ts.
export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'failed';

export interface Booking {
  id: string;
  carId: string;
  renterId: string;
  // M8 -- a snapshot of the renter's name/avatar taken at booking creation
  // time (see BookingsContext.createBooking), not a live lookup. Needed
  // because M6 moved to real Supabase Auth + RLS scoped to `id = auth.uid()`
  // only, which means an owner's AuthContext.getUserById(booking.renterId)
  // can no longer legitimately resolve to anything for any renter but
  // themself. The renter already knows their own name/avatar when they
  // create the booking, so writing it here needs no cross-user read at all
  // -- it's the one piece of "customer booking information" that stays
  // available to the owner under the current RLS. Optional so bookings
  // created before this field existed keep working (they fall back to
  // AuthContext.getUserById, which is what already silently degrades to
  // "Customer" for them today).
  renterName?: string;
  renterAvatar?: string;
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
  // M10 -- optional so bookings created before this field existed (any
  // booking made in M5-M9) keep working: PaymentScreen/BookingDetails treat
  // a missing paymentStatus as 'unpaid' rather than crashing or guessing.
  // Never a card/account number -- only ever this small status enum plus a
  // mock transaction id (see paymentGateway.ts) and, on a decline, a short
  // human-readable reason.
  paymentStatus?: PaymentStatus;
  paymentTransactionId?: string;
  paymentFailureReason?: string;
  paidAt?: string;
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
  // M7 -- "Available Now" quick filter. Kept as a plain flag here (matching
  // every other field in this state) but actually applied in HomeScreen, not
  // CarsContext, since answering it needs BookingsContext.getAvailableQuantity
  // and CarsContext has no dependency on BookingsContext today -- adding one
  // would be exactly the kind of architecture change this milestone is
  // scoped to avoid.
  availableOnly: boolean;
}

// M9 -- Trust & Safety. A report is always scoped to one concrete thing
// someone tapped "Report" on (a listing, a person, or a conversation) --
// there is no generic/unscoped report, mirroring how a Review is always
// scoped to one specific booking rather than being a free-floating comment.
export type ReportTargetKind = 'car' | 'user' | 'conversation';
export type ReportReason =
  | 'inappropriate_content'
  | 'suspicious_behavior'
  | 'fraud_or_scam'
  | 'inaccurate_listing'
  | 'safety_concern'
  | 'other';

export interface Report {
  id: string;
  reporterId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  // A display label (car name, or person's name) captured at report time --
  // deliberately NOT a live lookup. AuthContext.getUserById can only ever
  // resolve the current signed-in user under real Supabase Auth's RLS (see
  // the same note on Booking.renterName above), so a report about someone
  // else could never re-derive their name later anyway; capturing it once,
  // from whatever the reporting screen already had on hand, is the only
  // reliable option and needs no cross-user read at all.
  targetLabel: string;
  reason: ReportReason;
  details: string;
  createdAt: string;
  // Local-only triage state -- there is no backend moderation queue in this
  // build, so this deliberately never claims to be anything more than "has
  // someone looked at this on this device yet."
  status: 'open' | 'reviewed';
}
