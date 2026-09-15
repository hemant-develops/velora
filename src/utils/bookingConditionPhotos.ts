import { supabase } from '../lib/supabase';
import { uploadImageIfLocal, PickedImage } from './uploadImage';

// PHASE 7 -- Pickup/Return Condition Photos. Backed by the new, optional
// booking_condition_photos table (see
// supabase/migrations/0009_booking_condition_photos.sql for the full design
// rationale -- new table, not new columns on `bookings`, so this migration
// is non-blocking). Reuses uploadImageIfLocal (src/utils/uploadImage.ts) --
// the same hardened, retrying, pre-fetched-blob-aware upload primitive
// OwnerAddCarScreen/EditProfileScreen already use -- against a new dedicated
// Storage bucket, rather than duplicating any of that logic here.

export type ConditionPhotoStage = 'pickup' | 'return';

export type BookingConditionPhoto = {
  id: string;
  bookingId: string;
  stage: ConditionPhotoStage;
  url: string;
  uploadedBy: string | null;
  createdAt: string;
};

interface ConditionPhotoRow {
  id: string;
  booking_id: string;
  stage: string;
  url: string;
  uploaded_by: string | null;
  created_at: string;
}

const rowToPhoto = (row: ConditionPhotoRow): BookingConditionPhoto => ({
  id: row.id,
  bookingId: row.booking_id,
  stage: row.stage as ConditionPhotoStage,
  url: row.url,
  uploadedBy: row.uploaded_by,
  createdAt: row.created_at,
});

// Fails open (returns an empty list) on ANY error, including "relation
// booking_condition_photos does not exist" -- migration 0009 not having been
// run yet must never break BookingDetailsScreen, which works fine without
// this feature. Same fail-open convention as
// src/utils/blockedDates.ts/fetchBlockedDates.
export const fetchConditionPhotos = async (bookingId: string): Promise<BookingConditionPhoto[]> => {
  const { data, error } = await supabase
    .from('booking_condition_photos')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) {
    console.log(`VELORA_CONDITION_PHOTOS_FETCH_FAILED: ${error.message}`);
    return [];
  }
  return ((data ?? []) as ConditionPhotoRow[]).map(rowToPhoto);
};

// Uploads one picked photo to the booking-condition-photos bucket, then
// records it against this booking/stage. Throws on failure (upload or
// insert) -- unlike the fetch above, a failed *add* needs to reach the user
// as a real error (same convention as uploadCarImages), not fail silently.
export const uploadConditionPhoto = async (
  bookingId: string,
  stage: ConditionPhotoStage,
  image: PickedImage,
  uploadedBy: string,
): Promise<BookingConditionPhoto> => {
  const url = await uploadImageIfLocal(
    image.uri,
    'booking-condition-photos',
    `${bookingId}/${stage}/${Date.now()}`,
    image.blob,
  );
  const { data, error } = await supabase
    .from('booking_condition_photos')
    .insert({ booking_id: bookingId, stage, url, uploaded_by: uploadedBy })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToPhoto(data as ConditionPhotoRow);
};

export const deleteConditionPhoto = async (photoId: string): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.from('booking_condition_photos').delete().eq('id', photoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};
