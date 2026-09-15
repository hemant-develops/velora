// PHASE 6 -- Block Car (owner-blocked dates).
//
// A single, day-granularity table (one row per blocked calendar day, not a
// date range) -- see supabase/migrations/0008_car_blocked_dates.sql. Kept at
// day granularity deliberately, matching the day-granularity this whole
// app's availability model already uses everywhere else (BLOCKING_STATUSES,
// dateRangesOverlap, the create_local_car_booking_hold RPC) -- see that
// migration's own comment for the full reasoning.
//
// RLS on that table: any signed-in user can SELECT (a renter browsing a car
// they don't own still needs to know which dates are blocked), but only the
// car's owner can INSERT/DELETE their own car's rows.
import { supabase } from '../lib/supabase';

export interface BlockedDatesResult {
  dates: string[]; // 'YYYY-MM-DD'
  error?: string;
}

export const fetchBlockedDates = async (carId: string): Promise<BlockedDatesResult> => {
  const { data, error } = await supabase.from('car_blocked_dates').select('blocked_date').eq('car_id', carId);
  if (error) {
    console.log(`VELORA_BLOCKED_DATES_FETCH_ERROR car=${carId} message=${error.message}`);
    return { dates: [], error: error.message };
  }
  return { dates: ((data ?? []) as { blocked_date: string }[]).map((r) => r.blocked_date) };
};

export const blockDate = async (carId: string, date: string): Promise<{ error?: string }> => {
  const { error } = await supabase.from('car_blocked_dates').insert({ car_id: carId, blocked_date: date });
  if (error) {
    console.log(`VELORA_BLOCK_DATE_ERROR car=${carId} date=${date} message=${error.message}`);
    return { error: error.message };
  }
  return {};
};

export const unblockDate = async (carId: string, date: string): Promise<{ error?: string }> => {
  const { error } = await supabase.from('car_blocked_dates').delete().eq('car_id', carId).eq('blocked_date', date);
  if (error) {
    console.log(`VELORA_UNBLOCK_DATE_ERROR car=${carId} date=${date} message=${error.message}`);
    return { error: error.message };
  }
  return {};
};

// Any row in [pickupDate, dropoffDate] (inclusive both ends, matching
// dateRangesOverlap's own inclusive semantics elsewhere in this app) means
// the requested range can't be booked. Used as the authoritative gate inside
// BookingsContext.createBooking -- see that call site's own comment for why
// a lookup error there fails OPEN (allows the booking) rather than blocking
// a legitimate request over a transient network hiccup.
export const findBlockedDateInRange = async (
  carId: string,
  pickupDateOnly: string,
  dropoffDateOnly: string,
): Promise<{ blocked: boolean; error?: string }> => {
  const { data, error } = await supabase
    .from('car_blocked_dates')
    .select('blocked_date')
    .eq('car_id', carId)
    .gte('blocked_date', pickupDateOnly)
    .lte('blocked_date', dropoffDateOnly)
    .limit(1);
  if (error) {
    console.log(`VELORA_BLOCKED_DATES_RANGE_CHECK_ERROR car=${carId} message=${error.message}`);
    return { blocked: false, error: error.message };
  }
  return { blocked: (data ?? []).length > 0 };
};
