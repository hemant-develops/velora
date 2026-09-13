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

// PRODUCTION-AUDIT FIX (image-upload root cause pass) -- the previous
// implementation was a single, un-timed, un-retried attempt:
//   fetch(uri) -> .blob() -> storage.upload()
// Root causes identified for the intermittent "couldn't be uploaded" report
// that a device test proved still happens even after the AppState
// auto-refresh fix in lib/supabase.ts:
//   1. React Native's fetch(contentUri).blob() is a known-flaky path on
//      Android content:// URIs (especially a just-taken camera photo whose
//      MediaStore entry can still be settling) -- it can resolve with a
//      0-byte blob instead of throwing, which used to upload "successfully"
//      and produce a broken image with NO visible error at all.
//   2. No timeout -- a stalled request (poor signal, backgrounded app) could
//      hang until the OS's own multi-minute socket timeout instead of
//      failing fast with a retry.
//   3. No retry -- any single transient blip (one dropped packet, a token
//      refresh landing mid-request) failed the whole car save immediately.
//   4. The auto-refresh timer (lib/supabase.ts) keeps the session alive
//      while the app is foregrounded, but photo selection itself backgrounds
//      the app to Camera/Gallery for an unpredictable amount of time; there
//      was no check that the session was actually still valid at the exact
//      moment the upload begins.
// All four are addressed below with JS/TS-only changes (no native module
// added, no rebuild required). The same fetch(uri)->blob() pattern also
// existed in useVoiceRecorder.ts for voice-note uploads -- readUriAsBlob
// below is exported so that call site shares this same hardening instead of
// duplicating (and drifting from) it.

const READ_TIMEOUT_MS = 30000; // generous for mobile networks, but bounded
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 900;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// React Native's fetch has no built-in timeout, so a stalled request (poor
// signal, app backgrounded mid-request) can otherwise hang far longer than
// any user would wait before giving up. This races the real operation
// against a manual timer -- it doesn't abort the underlying socket, but it
// guarantees the calling flow fails fast and becomes retryable instead of
// hanging indefinitely.
const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);

const isRetryableMessage = (message: string): boolean =>
  /network|timed out|fetch failed|timeout|abort|empty when read|socket|connection/i.test(message);

// Reads an on-device URI (file://... or content://...) into a Blob, with a
// pre-read session-freshness check, a bounded timeout, up to 3 attempts on
// transient failures, and 0-byte-blob detection (see the top-of-file
// comment for why each of these exists). Shared by every place in the app
// that turns a picked file into upload bytes.
export const readUriAsBlobWithRetry = async (uri: string, label = 'file'): Promise<Blob> => {
  let lastError: Error = new Error('Unknown read error');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Pre-read session check -- a second, targeted safety net on top of
      // the AppState auto-refresh in lib/supabase.ts, right at the point of
      // use. getSession() returns the cached session and transparently
      // refreshes it if Supabase's client determines it's expired/expiring,
      // so this both confirms a session exists AND gives it a chance to
      // refresh before the network-heavy part of the upload begins.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const response = await withTimeout<Response>(fetch(uri), READ_TIMEOUT_MS, `Reading ${label} from device`);
      if (!response.ok) {
        throw new Error(`Couldn't read ${label} from device (status ${response.status})`);
      }
      const blob = await response.blob();

      // A 0-byte blob is the classic RN fetch(contentUri).blob() failure
      // mode -- it resolves without throwing, so without this check an
      // upload would "succeed" with an empty file and produce silently
      // broken media. Treated as retryable: re-reading the same content://
      // URI a moment later frequently succeeds once the OS finishes
      // settling the file.
      if (!blob || blob.size === 0) {
        throw new Error(`${label} was empty when read from device`);
      }
      return blob;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(
        `VELORA_MEDIA_READ_ATTEMPT_FAILED: label=${label} attempt=${attempt}/${MAX_ATTEMPTS} error=${lastError.message}`,
      );
      const canRetry = attempt < MAX_ATTEMPTS && isRetryableMessage(lastError.message);
      if (canRetry) {
        await wait(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  throw lastError;
};

type UploadResult = { url: string; storagePath: string | null };

// Internal implementation shared by uploadImageIfLocal (public, URL-only
// return, used by uploadAvatar) and uploadCarImages (needs the storage path
// too, so a later failure in the same batch can clean up what already
// succeeded instead of leaving it orphaned in Storage).
const uploadImageIfLocalInternal = async (uri: string, bucket: string, path: string): Promise<UploadResult> => {
  if (/^https?:\/\//i.test(uri)) return { url: uri, storagePath: null };

  // Computed once (not per retry attempt) so every retry targets the exact
  // same storage path -- combined with upsert:true this makes retries
  // idempotent (a retry overwrites the same file rather than creating a new
  // one), so a slow-but-eventually-successful attempt never leaves an
  // earlier partial upload behind as orphaned storage.
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fullPath = `${path}.${ext}`;

  let lastError: Error = new Error('Unknown upload error');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const blob = await readUriAsBlobWithRetry(uri, 'photo');

      const { error } = await withTimeout<{ data: unknown; error: { message: string } | null }>(
        supabase.storage.from(bucket).upload(fullPath, blob, { contentType, upsert: true }),
        READ_TIMEOUT_MS,
        'Uploading photo',
      );
      if (error) {
        throw new Error(error.message);
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
      return { url: data.publicUrl, storagePath: fullPath };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(
        `VELORA_IMAGE_UPLOAD_ATTEMPT_FAILED: attempt=${attempt}/${MAX_ATTEMPTS} path=${fullPath} error=${lastError.message}`,
      );
      // readUriAsBlobWithRetry already retried transient read failures
      // internally, so a retry here is only for the storage.upload() call
      // itself failing after a good read (e.g. a dropped connection during
      // the actual upload).
      const canRetry = attempt < MAX_ATTEMPTS && isRetryableMessage(lastError.message);
      if (canRetry) {
        await wait(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(`Couldn't upload image: ${lastError.message}`);
};

export const uploadImageIfLocal = async (uri: string, bucket: string, path: string): Promise<string> =>
  (await uploadImageIfLocalInternal(uri, bucket, path)).url;

// Uploads every local URI in `uris` (passing through any that are already
// real URLs), one at a time under `${bucket}/${userId}/...` so storage RLS
// (see supabase_migration_multidevice.sql section 9d) can scope writes to
// each user's own folder. `keyPrefix` disambiguates multiple images from
// the same upload (index-based) so they don't overwrite each other.
export const uploadCarImages = async (uris: string[], ownerId: string): Promise<string[]> => {
  const uploaded: string[] = [];
  const uploadedPaths: string[] = [];

  for (let i = 0; i < uris.length; i++) {
    try {
      const result = await uploadImageIfLocalInternal(uris[i], 'car-photos', `${ownerId}/${Date.now()}_${i}`);
      uploaded.push(result.url);
      if (result.storagePath) uploadedPaths.push(result.storagePath);
    } catch (err) {
      // Rollback/cleanup -- don't leave earlier photos from this same batch
      // orphaned in Storage when a later one fails and the whole car save is
      // aborted by the caller (OwnerAddCarScreen never persists a partial
      // `images` array on failure, so those files would otherwise never be
      // referenced by anything). Best-effort only: a cleanup failure is
      // logged but never overrides the real upload error being thrown.
      if (uploadedPaths.length > 0) {
        supabase.storage
          .from('car-photos')
          .remove(uploadedPaths)
          .catch((cleanupErr: unknown) => {
            console.log(`VELORA_IMAGE_UPLOAD_CLEANUP_FAILED: ${String(cleanupErr)}`);
          });
      }
      const message = err instanceof Error ? err.message : String(err);
      // Names exactly which photo failed (out of how many) so the error is
      // debuggable from a logcat pull even though the on-screen message
      // stays a simple, user-facing sentence (see OwnerAddCarScreen).
      throw new Error(`Photo ${i + 1} of ${uris.length} failed: ${message}`);
    }
  }
  return uploaded;
};

export const uploadAvatar = async (uri: string, userId: string): Promise<string> =>
  uploadImageIfLocal(uri, 'avatars', `${userId}/${Date.now()}`);
