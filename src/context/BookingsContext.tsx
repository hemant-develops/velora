import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { Booking, BookingStatus, PaymentStatus, RentalMode } from '../types';
import { formatCurrency, formatShortDate, generateBookingId } from '../utils/format';
import { dateRangesOverlap, toLocalDateOnly } from '../utils/dateRange';
import { getCarQuantity } from '../utils/inventory';
import { findBlockedDateInRange } from '../utils/blockedDates';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useCars } from './CarsContext';
import { useNotifications } from './NotificationsContext';

// MULTI-DEVICE MIGRATION -- the rich booking record used to live only in
// this device's AsyncStorage (`velora.bookings.v1`), so an owner on a
// different phone from the renter would never see the booking at all. It
// now lives in the real, shared `public.bookings` table (see
// supabase_migration_multidevice.sql), RLS-scoped to exactly the renter and
// the car's owner. `public.local_car_inventory` and its three RPCs
// (sync_local_car_inventory / create_local_car_booking_hold /
// set_local_car_booking_hold_status) are COMPLETELY UNCHANGED below -- they
// remain the one and only source of truth for the atomic "is this car
// available" decision, called in exactly the same place with exactly the
// same parameters as before. This file only changes WHERE the rich booking
// record itself (renter/price/status/...) is read from and written to.

// Only these statuses represent the car actually being held for someone —
// a 'pending' booking still needs the owner's confirmation but already
// occupies the requested dates until they act on it; a 'completed' one's
// dates are already in the past and a 'cancelled'/'rejected' one never
// happened, so none of those three should block a new booking from using
// those same calendar dates.
const BLOCKING_STATUSES: BookingStatus[] = ['pending', 'upcoming', 'active'];

// M8 -- the single source of truth for which status changes are legal from
// which starting status. Enforced here, at the data layer, rather than only
// by which buttons a screen happens to render -- so a stale screen, a
// double-tap before a re-render hides a button, or any future caller can
// never push a booking through an invalid transition (e.g. rejecting an
// already-confirmed booking, or cancelling one that's already active).
// 'completed'/'cancelled'/'rejected' are terminal -- nothing transitions out
// of them.
const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['upcoming', 'rejected', 'cancelled'],
  upcoming: ['active', 'cancelled'],
  active: ['completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

const canTransition = (from: BookingStatus, to: BookingStatus): boolean => VALID_TRANSITIONS[from].includes(to);

// Returned by every owner/renter status-changing action below instead of
// `void`, so a rejected transition (see canTransition) can surface a clear,
// specific reason to the screen that called it (Alert.alert) instead of
// silently doing nothing or throwing.
export interface BookingActionResult {
  success: boolean;
  error?: string;
}

// Maps the EXACT RAISE EXCEPTION text this app's own SQL
// (create_local_car_booking_hold / sync_local_car_inventory) is known to
// produce on purpose into the renter-facing wording required by the
// product spec. Anything NOT in this map (a network failure, an unexpected
// Postgrest/driver error, a schema-cache miss, an RLS error, etc.) falls
// back to a single generic, non-technical message so a raw database error
// can never reach the UI. Keep the keys here in sync with the RAISE
// EXCEPTION text in the SQL migration if that text ever changes -- if it
// drifts, the symptom is that a legitimate rejection shows the generic
// fallback instead of its specific message, which is still safe, just
// less precise.
const KNOWN_RPC_ERROR_MESSAGES: Record<string, string> = {
  'This car is no longer available.': 'This vehicle is no longer available.',
  'This car is already fully booked for the selected dates. Please choose different dates or another vehicle.':
    'That vehicle is fully booked for the selected dates. Please choose different dates.',
  'This car has not finished syncing yet. Please try again in a moment.':
    'This vehicle is still syncing. Please try again in a moment.',
};

const GENERIC_BOOKING_ERROR = "We couldn't confirm the booking right now. Please try again.";

const toFriendlyBookingError = (rawMessage: string): string =>
  KNOWN_RPC_ERROR_MESSAGES[rawMessage] ?? GENERIC_BOOKING_ERROR;

export interface CreateBookingInput {
  carId: string;
  renterId: string;
  renterName: string;
  renterAvatar: string;
  rentalMode: RentalMode;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
  days: number;
  subtotal: number;
  taxes: number;
  serviceFee: number;
  total: number;
  paymentMethod: string;
  agreementSignedBy: string;
  agreementSignedAt: string;
}

// M10 -- input to recordPaymentResult (see that function's own comment).
export interface RecordPaymentResultInput {
  bookingId: string;
  paymentMethod: string;
  status: PaymentStatus;
  transactionId?: string;
  failureReason?: string;
}

interface BookingsContextValue {
  bookings: Booking[];
  isLoading: boolean;
  createBooking: (input: CreateBookingInput) => Promise<Booking>;
  getBookingsForRenter: (renterId: string) => Booking[];
  getBookingsForCars: (carIds: string[]) => Booking[];
  getBookingById: (bookingId: string) => Booking | undefined;
  // BUG FIX -- returns whether the write actually persisted. Previously
  // this always resolved successfully even when the underlying `.update()`
  // failed (e.g. a network hiccup right after a real wallet debit already
  // happened) -- PaymentScreen had no way to know the difference and would
  // still navigate to BookingConfirmation showing success on a payment that
  // was never actually recorded server-side.
  recordPaymentResult: (input: RecordPaymentResultInput) => Promise<boolean>;
  // Fast local read: this car's quantity minus however many of its
  // pending/upcoming/active bookings overlap the given date range, counted
  // only from bookings this device's RLS-scoped session can see (its own,
  // as renter or owner). This is a UI-feedback approximation only (and, for
  // a renter browsing a car they don't own, an UNDER-count of how many
  // units are really taken by OTHER renters, since RLS doesn't expose
  // another renter's booking rows to them) -- the actual, race-safe gate at
  // booking-creation time is always the Supabase
  // create_local_car_booking_hold RPC inside createBooking below, never
  // this number. Kept as the instant, synchronous first paint for
  // HomeScreen's "Available Now" filter and BookingScreen's initial render;
  // BookingScreen also corrects it a moment later via
  // getAccurateAvailableQuantity below.
  getAvailableQuantity: (carId: string, pickupDate: string, dropoffDate: string) => number;
  // Accurate, privacy-safe count via the get_car_taken_count SECURITY
  // DEFINER RPC (see supabase_migration_multidevice.sql) -- counts EVERY
  // renter's overlapping blocking-status bookings for this car server-side,
  // not just the ones this device's RLS session can see. Used to correct
  // the fast local getAvailableQuantity() estimate above a moment after it
  // renders (see BookingScreen), never as the actual booking gate itself --
  // that remains create_local_car_booking_hold, unchanged, inside
  // createBooking above.
  getAccurateAvailableQuantity: (carId: string, pickupDate: string, dropoffDate: string) => Promise<number>;
  confirmBooking: (bookingId: string) => Promise<BookingActionResult>;
  rejectBooking: (bookingId: string) => Promise<BookingActionResult>;
  cancelBooking: (bookingId: string, cancelledBy: 'renter' | 'owner') => Promise<BookingActionResult>;
  updateStatus: (bookingId: string, status: BookingStatus) => Promise<BookingActionResult>;
  // New -- lets a screen force a re-pull (e.g. pull-to-refresh) on top of
  // the automatic refetch this context already does after every mutation,
  // on auth changes, and on realtime notifications.
  refreshBookings: () => Promise<void>;
  // DEV-ONLY: deletes every booking THIS ACCOUNT made as a renter (never
  // one made by someone else on one of their own car listings -- see
  // bookings_delete's RLS policy). Only present when __DEV__ is true.
  resetLocalBookingsForTesting?: () => Promise<void>;
}

const BookingsContext = createContext<BookingsContextValue | undefined>(undefined);

interface BookingRow {
  id: string;
  car_id: string;
  renter_id: string;
  owner_id: string;
  renter_name: string | null;
  renter_avatar: string | null;
  rental_mode: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  dropoff_date: string;
  pickup_time: string;
  dropoff_time: string;
  days: number;
  subtotal: number;
  taxes: number;
  service_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  payment_transaction_id: string | null;
  payment_failure_reason: string | null;
  paid_at: string | null;
  status: string;
  agreement_signed_by: string;
  agreement_signed_at: string | null;
  created_at: string;
}

const rowToBooking = (row: BookingRow): Booking => ({
  id: row.id,
  carId: row.car_id,
  renterId: row.renter_id,
  renterName: row.renter_name ?? undefined,
  renterAvatar: row.renter_avatar ?? undefined,
  rentalMode: row.rental_mode as RentalMode,
  pickupLocation: row.pickup_location,
  dropoffLocation: row.dropoff_location,
  pickupDate: row.pickup_date,
  dropoffDate: row.dropoff_date,
  pickupTime: row.pickup_time,
  dropoffTime: row.dropoff_time,
  days: row.days,
  subtotal: row.subtotal,
  taxes: row.taxes,
  serviceFee: row.service_fee,
  total: row.total,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status as PaymentStatus,
  paymentTransactionId: row.payment_transaction_id ?? undefined,
  paymentFailureReason: row.payment_failure_reason ?? undefined,
  paidAt: row.paid_at ?? undefined,
  status: row.status as BookingStatus,
  createdAt: row.created_at,
  agreementSignedBy: row.agreement_signed_by,
  agreementSignedAt: row.agreement_signed_at ?? row.created_at,
});

// Alerts the owner (vibration + a short chime) the moment a new booking
// comes in for one of their cars.
const notifyNewBooking = () => {
  try {
    Vibration.vibrate([0, 200, 100, 200, 100, 400]);
  } catch (e) {
    // Vibration API can be unavailable on some environments (e.g. web) --
    // fail silently rather than break the booking flow.
  }
  try {
    const player = createAudioPlayer(require('../../assets/sounds/booking_alert.wav'));
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch (e) {
        // already released -- ignore
      }
    }, 3000);
  } catch (e) {
    // Audio playback can fail (e.g. silent mode restrictions) -- the
    // vibration alone is still enough to notify the owner.
  }
};

export const BookingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { getCarById, syncCarInventory } = useCars();
  const { notify } = useNotifications();
  const fetchTokenRef = useRef(0);

  const fetchBookings = async () => {
    const token = ++fetchTokenRef.current;
    try {
      // RLS on bookings returns exactly the rows this signed-in user is
      // allowed to see: every booking where they're the renter, plus every
      // booking on a car they own (see bookings_select policy).
      const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
      if (fetchTokenRef.current !== token) return;
      if (error) {
        console.log(`VELORA_BOOKINGS_FETCH_ERROR: ${error.message}`);
        return;
      }
      setBookings(((data ?? []) as BookingRow[]).map(rowToBooking));
    } catch (error) {
      if (fetchTokenRef.current !== token) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_BOOKINGS_FETCH_FAILED: ${message}`);
    } finally {
      if (fetchTokenRef.current === token) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchBookings();
    });
    // Live updates -- a new booking request, or a confirm/reject/cancel/
    // complete, shows up on the OTHER party's device without them needing
    // to background/foreground the app.
    const channel = supabase
      .channel('bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings();
      })
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // M10 -- plain field edit on an existing booking -- never creates a
  // booking, never changes booking.status, never calls a Supabase hold RPC.
  const recordPaymentResult = async (input: RecordPaymentResultInput): Promise<boolean> => {
    const { bookingId, paymentMethod, status, transactionId, failureReason } = input;
    console.log(`VELORA_PAYMENT_STATUS booking=${bookingId} method=${paymentMethod} status=${status}`);
    const patch = {
      payment_method: paymentMethod,
      payment_status: status,
      payment_transaction_id: transactionId,
      payment_failure_reason: status === 'failed' ? failureReason : null,
      paid_at: status === 'paid' ? new Date().toISOString() : undefined,
    };
    const { error } = await supabase.from('bookings').update(patch).eq('id', bookingId);
    if (error) {
      console.log(`VELORA_PAYMENT_UPDATE_ERROR booking=${bookingId} message=${error.message}`);
      return false;
    }
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              paymentMethod,
              paymentStatus: status,
              paymentTransactionId: transactionId ?? b.paymentTransactionId,
              paymentFailureReason: status === 'failed' ? failureReason : undefined,
              paidAt: status === 'paid' ? new Date().toISOString() : b.paidAt,
            }
          : b,
      ),
    );
    return true;
  };

  const createBooking = async (input: CreateBookingInput): Promise<Booking> => {
    console.log(
      `VELORA_BOOKING_CREATE_START car=${input.carId} pickup=${input.pickupDate} dropoff=${input.dropoffDate}`,
    );

    const car = getCarById(input.carId);
    if (!car) {
      throw new Error('This car is no longer available.');
    }
    if (car.isActive === false) {
      throw new Error('This car is not currently available for booking.');
    }
    if (toLocalDateOnly(input.dropoffDate) < toLocalDateOnly(input.pickupDate)) {
      throw new Error('Drop-off date cannot be before pickup date.');
    }

    // PHASE 6 -- Block Car. An ADVISORY gate on top of the real
    // create_local_car_booking_hold RPC below, not a replacement for it --
    // see src/utils/blockedDates.ts and 0008_car_blocked_dates.sql for why a
    // lookup error here fails OPEN (never blocks a legitimate booking over a
    // transient network hiccup) rather than failing closed.
    const blockedCheck = await findBlockedDateInRange(
      input.carId,
      toLocalDateOnly(input.pickupDate),
      toLocalDateOnly(input.dropoffDate),
    );
    if (blockedCheck.blocked) {
      throw new Error('These dates are blocked by the owner and unavailable for booking.');
    }

    const bookingId = generateBookingId();

    // --- UNCHANGED: the exact same atomic availability gate as before. ---
    try {
      await syncCarInventory(car);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_BOOKING_PRESYNC_SKIPPED car=${car.id} reason=${message}`);
    }

    const { error: holdError } = await supabase.rpc('create_local_car_booking_hold', {
      p_booking_id: bookingId,
      p_local_car_id: input.carId,
      p_renter_id: input.renterId,
      p_pickup_date: toLocalDateOnly(input.pickupDate),
      p_dropoff_date: toLocalDateOnly(input.dropoffDate),
    });
    if (holdError) {
      console.log(
        `VELORA_BOOKING_HOLD_ERROR booking=${bookingId} car=${input.carId} message=${holdError.message}`,
      );
      throw new Error(toFriendlyBookingError(holdError.message));
    }
    console.log(`VELORA_BOOKING_HOLD_OK booking=${bookingId} car=${input.carId}`);
    // --- end unchanged section ---

    const { renterName, renterAvatar, ...rest } = input;

    // PHASE 6 -- Instant Book. undefined/false (the default) keeps every
    // booking starting 'pending', unchanged from Phase 1-5 -- it only
    // becomes a real, confirmed reservation once the owner explicitly
    // accepts it. `car.instantBook === true` skips straight to 'upcoming'.
    // Insert into the shared table -- owner_id is filled in server-side by
    // the velora_set_booking_owner_id trigger from car_listings, so the
    // client never sends (or can spoof) it.
    const initialStatus: BookingStatus = car.instantBook === true ? 'upcoming' : 'pending';
    const { data, error: insertError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        car_id: rest.carId,
        renter_id: rest.renterId,
        renter_name: renterName,
        renter_avatar: renterAvatar,
        rental_mode: rest.rentalMode,
        pickup_location: rest.pickupLocation,
        dropoff_location: rest.dropoffLocation,
        pickup_date: toLocalDateOnly(rest.pickupDate),
        dropoff_date: toLocalDateOnly(rest.dropoffDate),
        pickup_time: rest.pickupTime,
        dropoff_time: rest.dropoffTime,
        days: rest.days,
        subtotal: rest.subtotal,
        taxes: rest.taxes,
        service_fee: rest.serviceFee,
        total: rest.total,
        payment_method: rest.paymentMethod,
        status: initialStatus,
        agreement_signed_by: rest.agreementSignedBy,
        agreement_signed_at: rest.agreementSignedAt,
      })
      .select('*')
      .single();

    if (insertError || !data) {
      console.log(`VELORA_BOOKING_INSERT_ERROR booking=${bookingId} message=${insertError?.message}`);
      // The Supabase hold already succeeded above -- rather than leave an
      // orphaned hold with no matching booking row, mark that hold
      // cancelled so it doesn't permanently occupy the unit.
      await supabase.rpc('set_local_car_booking_hold_status', { p_booking_id: bookingId, p_status: 'cancelled' }).then(
        () => {},
        () => {},
      );
      throw new Error(GENERIC_BOOKING_ERROR);
    }

    const booking = rowToBooking(data as BookingRow);
    setBookings((prev) => [booking, ...prev]);
    console.log(`VELORA_BOOKING_PERSISTED id=${booking.id} car=${booking.carId} renter=${booking.renterId} status=${booking.status}`);
    notifyNewBooking();

    // PHASE 6 -- Instant Book, continued. create_local_car_booking_hold
    // above creates the underlying inventory hold at its own default
    // status; every OTHER status change in this file immediately syncs that
    // hold via set_local_car_booking_hold_status (see applyStatus below) so
    // the two never drift -- this is the same sync, done once here for the
    // one status a booking can now start at besides 'pending'.
    if (initialStatus === 'upcoming') {
      const { error: syncError } = await supabase.rpc('set_local_car_booking_hold_status', {
        p_booking_id: bookingId,
        p_status: 'upcoming',
      });
      if (syncError) {
        console.log(`VELORA_INSTANT_BOOK_HOLD_SYNC_ERROR booking=${bookingId} message=${syncError.message}`);
      }
    }

    const carLabel = car.name;
    if (initialStatus === 'upcoming') {
      await notify({
        userId: car.ownerId,
        type: 'booking_created',
        title: 'New instant booking',
        message: `${renterName} instantly booked your ${carLabel} · ${formatCurrency(input.total)} · ${formatShortDate(input.pickupDate)} - ${formatShortDate(input.dropoffDate)}.`,
        target: { kind: 'booking', id: booking.id },
      });
      await notify({
        userId: input.renterId,
        type: 'booking_created',
        title: 'Booking confirmed',
        message: `Your booking for ${carLabel} is confirmed — this car accepts Instant Book, so no approval wait was needed.`,
        target: { kind: 'booking', id: booking.id },
      });
    } else {
      await notify({
        userId: car.ownerId,
        type: 'booking_created',
        title: 'New booking request',
        message: `${renterName} requested to book your ${carLabel} · ${formatCurrency(input.total)} · ${formatShortDate(input.pickupDate)} - ${formatShortDate(input.dropoffDate)}.`,
        target: { kind: 'booking', id: booking.id },
      });
      await notify({
        userId: input.renterId,
        type: 'booking_created',
        title: 'Booking request sent',
        message: `Your request for ${carLabel} has been sent to the owner. You'll be notified once it's confirmed.`,
        target: { kind: 'booking', id: booking.id },
      });
    }

    return booking;
  };

  // MULTI-DEVICE MIGRATION -- this used to only ever update local state (an
  // operation that couldn't meaningfully fail), so every caller below just
  // assumed it worked and unconditionally returned { success: true }. Now
  // that it writes to Supabase, the update CAN genuinely fail (a network
  // hiccup, an RLS/permission issue) -- so it now returns a plain boolean
  // the caller actually checks, instead of every confirm/reject/cancel/
  // update action lying to the screen (and the other party's notification)
  // about having succeeded when the database was never actually touched.
  const applyStatus = async (
    bookingId: string,
    status: BookingStatus,
    recipient: { userId: string; title: string; message: string } | null,
  ): Promise<boolean> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return false;
    const previousStatus = target.status;
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) {
      console.log(`VELORA_BOOKING_STATUS_UPDATE_ERROR id=${bookingId} message=${error.message}`);
      return false;
    }
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)));
    console.log(`VELORA_BOOKING_STATUS_CHANGED id=${bookingId} from=${previousStatus} to=${status}`);
    // --- UNCHANGED: keep the Supabase inventory ledger's hold status in
    // sync, exactly as before. ---
    try {
      const { error: holdError } = await supabase.rpc('set_local_car_booking_hold_status', {
        p_booking_id: bookingId,
        p_status: status,
      });
      if (holdError) {
        console.log(`VELORA_BOOKING_STATUS_SYNC_ERROR booking=${bookingId} status=${status} message=${holdError.message}`);
      } else {
        console.log(`VELORA_BOOKING_STATUS_SYNC_OK booking=${bookingId} status=${status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`VELORA_BOOKING_STATUS_SYNC_ERROR booking=${bookingId} status=${status} message=${message}`);
    }
    if (recipient) {
      await notify({
        userId: recipient.userId,
        type: 'booking_status',
        title: recipient.title,
        message: recipient.message,
        target: { kind: 'booking', id: bookingId },
      });
    }
    return true;
  };

  const confirmBooking = async (bookingId: string): Promise<BookingActionResult> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return { success: false, error: 'This booking could not be found.' };
    if (!canTransition(target.status, 'upcoming')) {
      console.log(`VELORA_BOOKING_INVALID_TRANSITION id=${bookingId} from=${target.status} to=upcoming action=confirm`);
      return { success: false, error: 'This booking can no longer be confirmed.' };
    }
    const car = getCarById(target.carId);
    const ok = await applyStatus(bookingId, 'upcoming', {
      userId: target.renterId,
      title: 'Booking confirmed',
      message: `Your booking for ${car?.name ?? 'your car'} has been confirmed by the owner.`,
    });
    return ok ? { success: true } : { success: false, error: "We couldn't confirm this booking right now. Please try again." };
  };

  const rejectBooking = async (bookingId: string): Promise<BookingActionResult> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return { success: false, error: 'This booking could not be found.' };
    if (!canTransition(target.status, 'rejected')) {
      console.log(`VELORA_BOOKING_INVALID_TRANSITION id=${bookingId} from=${target.status} to=rejected action=reject`);
      return { success: false, error: 'This booking can no longer be rejected.' };
    }
    const car = getCarById(target.carId);
    const ok = await applyStatus(bookingId, 'rejected', {
      userId: target.renterId,
      title: 'Booking declined',
      message: `The owner was unable to accept your booking request for ${car?.name ?? 'this car'}.`,
    });
    return ok ? { success: true } : { success: false, error: "We couldn't decline this booking right now. Please try again." };
  };

  const cancelBooking = async (bookingId: string, cancelledBy: 'renter' | 'owner'): Promise<BookingActionResult> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return { success: false, error: 'This booking could not be found.' };
    if (!canTransition(target.status, 'cancelled')) {
      console.log(`VELORA_BOOKING_INVALID_TRANSITION id=${bookingId} from=${target.status} to=cancelled action=cancel`);
      const error =
        target.status === 'active'
          ? 'This rental is already active and can no longer be cancelled.'
          : target.status === 'completed'
            ? 'This rental has already been completed and can no longer be cancelled.'
            : target.status === 'cancelled'
              ? 'This booking has already been cancelled.'
              : target.status === 'rejected'
                ? 'This booking was already declined and cannot be cancelled.'
                : 'This booking can no longer be cancelled.';
      return { success: false, error };
    }
    const car = getCarById(target.carId);
    const carLabel = car?.name ?? 'this car';
    const recipient =
      cancelledBy === 'renter'
        ? { userId: car?.ownerId ?? '', title: 'Booking cancelled', message: `A booking for your ${carLabel} was cancelled by the customer.` }
        : { userId: target.renterId, title: 'Booking cancelled', message: `Your booking for ${carLabel} was cancelled by the owner.` };
    const ok = await applyStatus(bookingId, 'cancelled', recipient.userId ? recipient : null);
    return ok ? { success: true } : { success: false, error: "We couldn't cancel this booking right now. Please try again." };
  };

  const updateStatus = async (bookingId: string, status: BookingStatus): Promise<BookingActionResult> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return { success: false, error: 'This booking could not be found.' };
    if (!canTransition(target.status, status)) {
      console.log(`VELORA_BOOKING_INVALID_TRANSITION id=${bookingId} from=${target.status} to=${status} action=updateStatus`);
      return { success: false, error: 'This booking cannot be updated right now.' };
    }
    const car = getCarById(target.carId);
    const carLabel = car?.name ?? 'your car';
    const statusText =
      status === 'active' ? 'is now active' : status === 'completed' ? 'has been completed' : null;
    const ok = await applyStatus(
      bookingId,
      status,
      statusText
        ? { userId: target.renterId, title: 'Booking update', message: `Your rental for ${carLabel} ${statusText}.` }
        : null,
    );
    return ok ? { success: true } : { success: false, error: "We couldn't update this booking right now. Please try again." };
  };

  const getAvailableQuantity = (carId: string, pickupDate: string, dropoffDate: string): number => {
    const car = getCarById(carId);
    if (!car) return 0;
    const taken = bookings.filter(
      (b) =>
        b.carId === carId &&
        BLOCKING_STATUSES.includes(b.status) &&
        dateRangesOverlap(b.pickupDate, b.dropoffDate, pickupDate, dropoffDate),
    ).length;
    const quantity = getCarQuantity(car);
    const available = Math.max(quantity - taken, 0);
    console.log(
      `VELORA_BOOKING_AVAILABILITY_CHECK car=${carId} pickup=${pickupDate} dropoff=${dropoffDate} quantity=${quantity} taken=${taken} available=${available}`,
    );
    return available;
  };

  // Same-device estimate above is instant but, for a renter browsing a car
  // they don't own, can UNDER-count units taken by other renters (RLS only
  // exposes this device's own bookings). This calls the server instead,
  // which sees every renter's bookings on this car -- still read-only, and
  // still never the actual booking-time safety gate. Falls back to the
  // local estimate on any RPC error so a display refinement can never turn
  // into a hard error for the renter.
  const getAccurateAvailableQuantity = async (carId: string, pickupDate: string, dropoffDate: string): Promise<number> => {
    const car = getCarById(carId);
    if (!car) return 0;
    const quantity = getCarQuantity(car);
    const { data, error } = await supabase.rpc('get_car_taken_count', {
      p_car_id: carId,
      p_pickup: toLocalDateOnly(pickupDate),
      p_dropoff: toLocalDateOnly(dropoffDate),
    });
    if (error) {
      console.log(`VELORA_AVAILABILITY_ACCURATE_ERROR car=${carId} message=${error.message}`);
      return getAvailableQuantity(carId, pickupDate, dropoffDate);
    }
    const taken = typeof data === 'number' ? data : 0;
    return Math.max(quantity - taken, 0);
  };

  // DEV-ONLY: deletes every booking this account made AS A RENTER (RLS's
  // bookings_delete policy only allows that) so a developer can clear out
  // old test bookings without them permanently occupying a test car's
  // dates. Never touches local_car_inventory_holds directly.
  const resetLocalBookingsForTesting = async (): Promise<void> => {
    const mine = bookings.filter((b) => b.renterId === user?.id);
    if (mine.length === 0) return;
    const { error } = await supabase.from('bookings').delete().in('id', mine.map((b) => b.id));
    if (error) {
      console.log(`VELORA_BOOKING_RESET_ERROR: ${error.message}`);
      return;
    }
    await fetchBookings();
  };

  const getBookingsForRenter = (renterId: string): Booking[] => {
    const result = bookings.filter((b) => b.renterId === renterId);
    console.log(`VELORA_BOOKING_USER_RENTALS renterId=${renterId} count=${result.length}`);
    return result;
  };

  const getBookingsForCars = (carIds: string[]): Booking[] => {
    const result = bookings.filter((b) => carIds.includes(b.carId));
    console.log(`VELORA_BOOKING_OWNER_RENTALS carIds=${carIds.join(',')} count=${result.length}`);
    return result;
  };

  const value = useMemo<BookingsContextValue>(
    () => ({
      bookings,
      isLoading,
      createBooking,
      getBookingsForRenter,
      getBookingsForCars,
      getBookingById: (bookingId) => bookings.find((b) => b.id === bookingId),
      recordPaymentResult,
      getAvailableQuantity,
      getAccurateAvailableQuantity,
      confirmBooking,
      rejectBooking,
      cancelBooking,
      updateStatus,
      refreshBookings: fetchBookings,
      ...(__DEV__ ? { resetLocalBookingsForTesting } : {}),
    }),
    [bookings, isLoading, user],
  );

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
};

export const useBookings = (): BookingsContextValue => {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within a BookingsProvider');
  return ctx;
};
