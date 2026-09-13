import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION GAP FIX -- OwnerAddCarScreen and EditProfileScreen
// were saving the raw on-device image-picker URI (file://... or
// content://...) directly into car_listings.images / the user's avatar.
// That works while viewing on the SAME device that picked it, but is
// meaningless to any other device -- exactly the "owner uploaded a car
// photo but it doesn't show" / "no real image" bug. This uploads the actual
// file bytes to a public Supabase Storage bucket and returns a real,
// permanent https URL any device can load.
//
// `uri` already being an http(s) URL (already-uploaded, e.g. re-saving an
// existing listing/profile without touching the photo) is passed through
// unchanged rather than re-uploaded.
export const uploadImageIfLocal = async (uri: string, bucket: string, path: string): Promise<string> => {
  if (/^https?:\/\//i.test(uri)) return uri;

  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fullPath = `${path}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(fullPath, blob, { contentType, upsert: true });
  if (error) {
    throw new Error(`Couldn't upload image: ${error.message}`);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return data.publicUrl;
};

// Uploads every local URI in `uris` (passing through any that are already
// real URLs), one at a time under `${bucket}/${userId}/...` so storage RLS
// (see supabase_migration_multidevice.sql section 9d) can scope writes to
// each user's own folder. `keyPrefix` disambiguates multiple images from
// the same upload (index-based) so they don't overwrite each other.
export const uploadCarImages = async (uris: string[], ownerId: string): Promise<string[]> => {
  const uploaded: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const url = await uploadImageIfLocal(uris[i], 'car-photos', `${ownerId}/${Date.now()}_${i}`);
    uploaded.push(url);
  }
  return uploaded;
};

export const uploadAvatar = async (uri: string, userId: string): Promise<string> =>
  uploadImageIfLocal(uri, 'avatars', `${userId}/${Date.now()}`);
