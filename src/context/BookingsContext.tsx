import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { storage } from '../utils/storage';
import { Booking, BookingStatus, RentalMode } from '../types';
import { formatCurrency, formatShortDate, generateBookingId } from '../utils/format';
import { dateRangesOverlap } from '../utils/dateRange';
import { useCars } from './CarsContext';
import { useNotifications } from './NotificationsContext';

// Only these statuses represent the car actually being held for someone —
// a 'pending' booking still needs the owner's confirmation but already
// occupies the requested dates until they act on it; a 'completed' one's
// dates are already in the past and a 'cancelled'/'rejected' one never
// happened, so none of those three should block a new booking from using
// those same calendar dates.
const BLOCKING_STATUSES: BookingStatus[] = ['pending', 'upcoming', 'active'];

const BOOKINGS_KEY = 'velora.bookings.v1';

export interface CreateBookingInput {
  carId: string;
  renterId: string;
  // Used only to compose the owner-facing "new booking request" notification
  // text below — never persisted onto the Booking record itself (the
  // renter's name is already derivable anywhere it's displayed via
  // AuthContext.getUserById(renterId), so storing it again here would be a
  // duplicate copy that could drift if the renter later renames themself).
  renterName: string;
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

interface BookingsContextValue {
  bookings: Booking[];
  isLoading: boolean;
  createBooking: (input: CreateBookingInput) => Promise<Booking>;
  getBookingsForRenter: (renterId: string) => Booking[];
  getBookingsForCars: (carIds: string[]) => Booking[];
  getBookingById: (bookingId: string) => Booking | undefined;
  // Owner actions on a 'pending' booking.
  confirmBooking: (bookingId: string) => Promise<void>;
  rejectBooking: (bookingId: string) => Promise<void>;
  // Either side can cancel before the trip starts ('pending' or 'upcoming').
  cancelBooking: (bookingId: string, cancelledBy: 'renter' | 'owner') => Promise<void>;
  // Owner progresses a confirmed booking through its remaining lifecycle
  // ('upcoming' -> 'active' -> 'completed').
  updateStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
}

const BookingsContext = createContext<BookingsContextValue | undefined>(undefined);

// Alerts the owner (vibration + a short chime) the moment a new booking
// comes in for one of their cars. In this demo build both roles share the
// same device, so we fire the alert immediately when the booking is
// created -- in a production backend this would instead be triggered by a
// push notification delivered to the owner's device.
const notifyNewBooking = () => {
  try {
    // Short-long-short buzz pattern so it reads distinctly as "new booking".
    Vibration.vibrate([0, 200, 100, 200, 100, 400]);
  } catch (e) {
    // Vibration API can be unavailable on some environments (e.g. web) --
    // fail silently rather than break the booking flow.
  }
  try {
    const player = createAudioPlayer(require('../../assets/sounds/booking_alert.wav'));
    player.play();
    // Release the player shortly after the chime finishes so we don't leak
    // native audio resources.
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
  const { getCarById } = useCars();
  const { notify } = useNotifications();

  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(BOOKINGS_KEY);
        if (raw) setBookings(JSON.parse(raw));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persist = async (next: Booking[]) => {
    setBookings(next);
    await storage.setItem(BOOKINGS_KEY, JSON.stringify(next));
  };

  const createBooking = async (input: CreateBookingInput): Promise<Booking> => {
    const car = getCarById(input.carId);
    if (!car) {
      throw new Error('This car is no longer available.');
    }
    // An owner can hide a car from renters at any time (Active/Inactive
    // toggle) — once hidden it can no longer receive new bookings, even if
    // the request reached this far (e.g. a screen that was already open).
    // Existing bookings made before it went inactive are never touched.
    if (car.isActive === false) {
      throw new Error('This car is not currently available for booking.');
    }

    // Checked against the current in-memory `bookings` state, immediately
    // before persisting, so this reflects every booking made so far in
    // this session (including ones made a moment ago) rather than a
    // possibly-stale snapshot from when the screen first loaded.
    const overlapping = bookings.find(
      (b) =>
        b.carId === input.carId &&
        BLOCKING_STATUSES.includes(b.status) &&
        dateRangesOverlap(b.pickupDate, b.dropoffDate, input.pickupDate, input.dropoffDate),
    );
    if (overlapping) {
      throw new Error(
        'This car is already booked for the selected dates. Please choose different dates or another vehicle.',
      );
    }

    const { renterName, ...bookingInput } = input;

    // Every new booking starts 'pending' — it only becomes a real,
    // confirmed reservation once the owner explicitly accepts it (see
    // confirmBooking/rejectBooking below). This is a deliberate change from
    // auto-confirming on creation: a real rental platform's owner needs a
    // chance to review and accept each request first.
    const booking: Booking = {
      id: generateBookingId(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      ...bookingInput,
    };
    await persist([booking, ...bookings]);
    notifyNewBooking();

    const carLabel = car.name;
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

    return booking;
  };

  // Shared by confirm/reject/cancel/updateStatus: persist the new status
  // and notify `recipientId` with the given title/message, all targeting
  // this booking's own Booking Details screen so a tap always lands on the
  // right place. Returns the pre-update booking (or undefined if it no
  // longer exists) so callers can read fields like carId/renterId first.
  const applyStatus = async (
    bookingId: string,
    status: BookingStatus,
    recipient: { userId: string; title: string; message: string } | null,
  ): Promise<Booking | undefined> => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return undefined;
    await persist(bookings.map((b) => (b.id === bookingId ? { ...b, status } : b)));
    if (recipient) {
      await notify({
        userId: recipient.userId,
        type: 'booking_status',
        title: recipient.title,
        message: recipient.message,
        target: { kind: 'booking', id: bookingId },
      });
    }
    return target;
  };

  const confirmBooking = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;
    const car = getCarById(target.carId);
    await applyStatus(bookingId, 'upcoming', {
      userId: target.renterId,
      title: 'Booking confirmed',
      message: `Your booking for ${car?.name ?? 'your car'} has been confirmed by the owner.`,
    });
  };

  const rejectBooking = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;
    const car = getCarById(target.carId);
    await applyStatus(bookingId, 'rejected', {
      userId: target.renterId,
      title: 'Booking declined',
      message: `The owner was unable to accept your booking request for ${car?.name ?? 'this car'}.`,
    });
  };

  const cancelBooking = async (bookingId: string, cancelledBy: 'renter' | 'owner') => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;
    const car = getCarById(target.carId);
    const carLabel = car?.name ?? 'this car';
    // Notify whichever side didn't cancel — the owner if the renter backed
    // out, or the renter if the owner did.
    const recipient =
      cancelledBy === 'renter'
        ? { userId: car?.ownerId ?? '', title: 'Booking cancelled', message: `A booking for your ${carLabel} was cancelled by the customer.` }
        : { userId: target.renterId, title: 'Booking cancelled', message: `Your booking for ${carLabel} was cancelled by the owner.` };
    await applyStatus(bookingId, 'cancelled', recipient.userId ? recipient : null);
  };

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) return;
    const car = getCarById(target.carId);
    const carLabel = car?.name ?? 'your car';
    const statusText =
      status === 'active' ? 'is now active' : status === 'completed' ? 'has been completed' : null;
    await applyStatus(
      bookingId,
      status,
      statusText
        ? { userId: target.renterId, title: 'Booking update', message: `Your rental for ${carLabel} ${statusText}.` }
        : null,
    );
  };

  const value = useMemo<BookingsContextValue>(
    () => ({
      bookings,
      isLoading,
      createBooking,
      getBookingsForRenter: (renterId) => bookings.filter((b) => b.renterId === renterId),
      getBookingsForCars: (carIds) => bookings.filter((b) => carIds.includes(b.carId)),
      getBookingById: (bookingId) => bookings.find((b) => b.id === bookingId),
      confirmBooking,
      rejectBooking,
      cancelBooking,
      updateStatus,
    }),
    [bookings, isLoading],
  );

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
};

export const useBookings = (): BookingsContextValue => {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within a BookingsProvider');
  return ctx;
};
