import { NavigatorScreenParams } from '@react-navigation/native';
import { RentalMode } from '../types';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  MessagesTab: undefined;
  RentsTab: undefined;
  ProfileTab: undefined;
};

export interface BookingDraft {
  carId: string;
  rentalMode: RentalMode;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
  days: number;
  // PHASE 1 -- the renter's actual selected rental duration in hours (e.g.
  // 24, 48, or a custom value >= 6), plus its display label (e.g. "24
  // Hours"). `days` above is kept unchanged and still drives the existing
  // per-day price formula (see utils/duration.ts durationHoursToBillableDays)
  // -- these two new fields are purely additive, for accurate duration
  // display on the Agreement screen; they are NOT yet persisted to the
  // `bookings` table (see supabase/migrations/0002_booking_duration.sql --
  // optional, not required for this phase to work).
  durationHours: number;
  durationLabel: string;
  subtotal: number;
  taxes: number;
  serviceFee: number;
  total: number;
  // ADMIN CONNECT -- the real promo code applied (validated against the
  // admin-managed public.promo_codes table via validate_promo_code), if
  // any. Carried through so RentalAgreementScreen can redeem it (increment
  // used_count) exactly once, at the moment the booking is actually
  // created -- not on every live-preview validation in BookingScreen.
  promoCode?: string;
}

export type RootStackParamList = {
  // Typed as a real nested-navigator param (not `undefined`) so every
  // `navigation.navigate('Main', { screen: 'SomeTab' })` call site is
  // actually type-checked against MainTabParamList instead of needing an
  // `as never` cast to silence the mismatch. See React Navigation's
  // NavigatorScreenParams helper -- this is its documented pattern for
  // nesting a tab navigator inside a stack navigator.
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  CarDetails: { carId: string };
  Booking: { carId: string };
  Agreement: BookingDraft;
  // The booking is created/persisted (see BookingsContext.createBooking,
  // called from RentalAgreementScreen.onSign) BEFORE ever navigating here --
  // Payment only ever operates on an already-existing Booking record, it
  // never creates one. Passing just the id (instead of the whole signed
  // draft) means Payment always reads the current canonical booking state
  // via useBookings().getBookingById, the same source every other
  // booking-aware screen reads from.
  Payment: { bookingId: string };
  BookingConfirmation: { bookingId: string };
  Filter: undefined;
  EditProfile: undefined;
  Favorites: undefined;
  ConversationDetail: {
    conversationId?: string;
    // Full info to start a brand-new thread when one doesn't exist yet —
    // provided by whichever screen already knows both parties (Car
    // Details, a public profile, Booking Details). renterId/renterName/
    // renterAvatar are optional and fall back to the current user when
    // omitted, which preserves the original behavior of every call site
    // that only ever had a renter opening a fresh thread; they're required
    // when the OWNER is the one starting/replying to a thread with a
    // customer, since the current user is the owner in that case, not the
    // renter.
    carId?: string;
    carName?: string;
    renterId?: string;
    renterName?: string;
    renterAvatar?: string;
    ownerId?: string;
    ownerName?: string;
    ownerAvatar?: string;
  };
  OwnerAddCar: { carId?: string } | undefined;
  OwnerBookingRequests: undefined;
  // PHASE 3 -- read-only calendar for one of the owner's own cars, showing
  // which dates already have a pending/upcoming/active booking (see
  // OwnerCarCalendarScreen).
  OwnerCarCalendar: { carId: string };
  OwnerVerification: undefined;
  OwnerProfile: { ownerId: string; carId?: string; carName?: string };
  // A pushed, dedicated screen for "Home -> tap a brand" (see BrandCarsScreen
  // for why this replaced the old in-place Home filter).
  BrandCars: { brandId: string };
  CustomerProfile: { userId: string; carId?: string; carName?: string };
  BookingDetails: { bookingId: string };
  LocationPicker: undefined;
  Notifications: undefined;
  // PHASE 5 -- per-category push mute (see NotificationSettingsScreen).
  NotificationSettings: undefined;
  PaymentMethods: undefined;
  HelpSupport: undefined;
  Legal: { kind: 'privacy' | 'terms' };
  // Rewards -- VELORA Credits wallet + Refer & Earn (RewardsContext). New,
  // additive routes; nothing above them changes.
  Wallet: undefined;
  ReferEarn: undefined;
  Offers: undefined;
  Review: { bookingId: string; carId: string };
  // M9 -- Trust & Safety. Always about one concrete thing (a listing, a
  // person, or a conversation) the reporting screen already had on hand --
  // see the Report type's own comment in types/index.ts for why targetLabel
  // is passed in here rather than looked up later.
  Report: { targetKind: 'car' | 'user' | 'conversation'; targetId: string; targetLabel: string };
};
