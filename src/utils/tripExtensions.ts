import { supabase } from '../lib/supabase';

// PHASE 7 -- Trip Extension / Early Return requests. Backed by the new,
// optional booking_extension_requests table (see
// supabase/migrations/0010_trip_extension_requests.sql for the full design
// rationale, including why this deliberately never touches
// bookings.days/subtotal/total).

export type ExtensionRequestType = 'extend' | 'early_return';
export type ExtensionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ExtensionRequest = {
  id: string;
  bookingId: string;
  requestedBy: string;
  requestType: ExtensionRequestType;
  currentDropoffDate: string;
  requestedDropoffDate: string;
  note: string | null;
  status: ExtensionRequestStatus;
  createdAt: string;
  respondedAt: string | null;
};

interface ExtensionRequestRow {
  id: string;
  booking_id: string;
  requested_by: string;
  request_type: string;
  current_dropoff_date: string;
  requested_dropoff_date: string;
  note: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

const rowToRequest = (row: ExtensionRequestRow): ExtensionRequest => ({
  id: row.id,
  bookingId: row.booking_id,
  requestedBy: row.requested_by,
  requestType: row.request_type as ExtensionRequestType,
  currentDropoffDate: row.current_dropoff_date,
  requestedDropoffDate: row.requested_dropoff_date,
  note: row.note,
  status: row.status as ExtensionRequestStatus,
  createdAt: row.created_at,
  respondedAt: row.responded_at,
});

// Day-granularity date math on plain 'YYYY-MM-DD'/ISO strings -- mirrors the
// day-granularity approach dateRange.ts's dateRangesOverlap already uses for
// this app's other calendar-day concepts (blocked dates, booking overlap).
export const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Fails open (empty list) on ANY error, including "relation does not exist"
// -- migration 0010 not having been run yet must never break
// BookingDetailsScreen, which works fine without this feature. Same
// fail-open convention as fetchBlockedDates/fetchConditionPhotos.
export const fetchExtensionRequests = async (bookingId: string): Promise<ExtensionRequest[]> => {
  const { data, error } = await supabase
    .from('booking_extension_requests')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) {
    console.log(`VELORA_EXTENSION_FETCH_FAILED: ${error.message}`);
    return [];
  }
  return ((data ?? []) as ExtensionRequestRow[]).map(rowToRequest);
};

export const createExtensionRequest = async (input: {
  bookingId: string;
  requestedBy: string;
  requestType: ExtensionRequestType;
  currentDropoffDate: string;
  requestedDropoffDate: string;
}): Promise<{ success: boolean; request?: ExtensionRequest; error?: string }> => {
  const { data, error } = await supabase
    .from('booking_extension_requests')
    .insert({
      booking_id: input.bookingId,
      requested_by: input.requestedBy,
      request_type: input.requestType,
      current_dropoff_date: input.currentDropoffDate,
      requested_dropoff_date: input.requestedDropoffDate,
    })
    .select('*')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, request: rowToRequest(data as ExtensionRequestRow) };
};

// Approve/reject -- meant to be called only from the owner's side of
// BookingDetailsScreen. `.eq('status', 'pending')` plus checking the
// returned row (via `.select()`) closes the race where the request was
// already responded to a moment earlier (a plain 0-row update is NOT an
// error from PostgREST, so without this check a second, stale "Approve" tap
// would silently report success while changing nothing).
//
// On approval this also moves the real booking's dropoff_date -- if THAT
// write fails, the request row is reverted back to 'pending' rather than
// left "approved" on a trip whose dates never actually moved.
export const respondToExtensionRequest = async (
  request: ExtensionRequest,
  approve: boolean,
): Promise<{ success: boolean; error?: string }> => {
  const { data: updatedRows, error: requestError } = await supabase
    .from('booking_extension_requests')
    .update({ status: approve ? 'approved' : 'rejected', responded_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id');
  if (requestError) return { success: false, error: requestError.message };
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'This request has already been responded to.' };
  }

  if (approve) {
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ dropoff_date: request.requestedDropoffDate })
      .eq('id', request.bookingId);
    if (bookingError) {
      await supabase
        .from('booking_extension_requests')
        .update({ status: 'pending', responded_at: null })
        .eq('id', request.id);
      return { success: false, error: bookingError.message };
    }
  }
  return { success: true };
};

// Withdraw -- meant to be called only from the renter's side, and only while
// still pending (same race-safe pattern as respondToExtensionRequest above).
export const cancelExtensionRequest = async (requestId: string): Promise<{ success: boolean; error?: string }> => {
  const { data: updatedRows, error } = await supabase
    .from('booking_extension_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'This request has already been responded to.' };
  }
  return { success: true };
};
