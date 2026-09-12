import { Booking } from '../types';
import { supabase } from '../lib/supabase';

// A booking only ever counts toward reliability once its trip lifecycle has
// actually concluded one way or another -- 'completed' (the trip ran its
// full course) or 'cancelled' (it didn't, whoever cancelled it). 'pending'
// and 'upcoming' bookings haven't concluded yet, and 'rejected' requests
// never became a real trip at all, so none of those three are counted here.
// This mirrors BookingsContext's own status taxonomy (BLOCKING_STATUSES /
// VALID_TRANSITIONS) rather than inventing a new one.
const CONCLUDED_STATUSES = new Set<Booking['status']>(['completed', 'cancelled']);

// Below this many concluded trips, a fraction ("2 of 2") reads as more
// definitive than it actually is. Below the threshold, callers should show
// a simple, honest "New host" signal instead of a number -- see
// CarDetailsScreen / OwnerPublicProfileScreen.
export const MIN_TRIPS_FOR_SCORE = 3;

// Only the most recent N concluded trips are considered, so a host's score
// reflects their RECENT track record rather than being diluted forever by
// something that happened a long time ago -- same idea the competitor's own
// "last N trips" framing uses.
const TRIP_WINDOW = 10;

export interface HostReliability {
  fulfilled: number;
  total: number;
}

// Computes "X of the last N trips were fulfilled" purely from this owner's
// own real Booking records (see BookingsContext.getBookingsForCars) -- never
// a static/aspirational number, and never inferred from anything but the
// booking.status field that already exists. Returns null when there isn't
// enough concluded history yet (see MIN_TRIPS_FOR_SCORE) so the caller can
// fall back to a simple factual indicator instead of a score that would
// overstate confidence.
export const getHostReliability = (ownerCarsBookings: Booking[]): HostReliability | null => {
  const concluded = ownerCarsBookings
    .filter((b) => CONCLUDED_STATUSES.has(b.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, TRIP_WINDOW);
  if (concluded.length < MIN_TRIPS_FOR_SCORE) return null;
  const fulfilled = concluded.filter((b) => b.status === 'completed').length;
  return { fulfilled, total: concluded.length };
};

// MULTI-DEVICE MIGRATION -- getHostReliability above only works when the
// caller already has that owner's raw Booking records in hand, which used
// to come straight from BookingsContext's own local state. Now that
// bookings are RLS-scoped (renter_id = auth.uid() OR owner_id = auth.uid()),
// a renter's device never receives a DIFFERENT owner's booking rows at all
// -- so calling getBookingsForCars(someOtherOwnersCarIds) from a renter's
// session silently returns an empty array, and every experienced host would
// incorrectly show as "New host" to everyone except their own past renters.
// This calls the get_owner_reliability_stats SECURITY DEFINER RPC instead
// (see supabase_migration_multidevice.sql), which runs the exact same
// CONCLUDED_STATUSES / TRIP_WINDOW / MIN_TRIPS_FOR_SCORE logic as
// getHostReliability above, but server-side across ALL of that owner's real
// bookings -- returning only the two aggregate counts below, never
// individual booking rows, renter names, or pricing, so it stays
// privacy-safe for any viewer.
export const fetchHostReliability = async (ownerId: string): Promise<HostReliability | null> => {
  const { data, error } = await supabase.rpc('get_owner_reliability_stats', { p_owner_id: ownerId });
  if (error) {
    console.log(`VELORA_HOST_RELIABILITY_ERROR owner=${ownerId} message=${error.message}`);
    return null;
  }
  const result = data as { fulfilled: number; total: number } | null;
  return result ? { fulfilled: result.fulfilled, total: result.total } : null;
};
