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

// PHASE 1 IMAGE PIPELINE FIX (confirmed root cause, device-log verified) --
// the four fixes above still left one real gap: retrying a *fresh* read of
// the same picker URI does nothing when the underlying OS read grant has
// been permanently revoked (not a transient blip). Android's system Photo
// Picker (and some gallery apps) only guarantee a content:// URI stays
// readable for a short window around the pick -- if the owner keeps filling
// in the rest of this long form for a while before tapping Save, that grant
// can already be gone by the time an upload actually runs, surfacing as an
// HTTP 404 with no real network problem involved at all.
//
// The fix is `preFetchedBlob` on every function below: OwnerAddCarScreen and
// EditProfileScreen now call readUriAsBlobWithRetry() themselves immediately
// after the picker returns -- while the grant is certainly still fresh --
// and hand the already-read Blob straight through here, so nothing ever has
// to re-read the original URI at Save time, however much later that is.
// Deliberately implemented with zero new dependencies: a Blob already read
// into memory is just as durable as a file copied to disk for the lifetime
// of this form, and this avoids adding a native module (which would need a
// full native rebuild, not just an OTA update, before it could ship at all,
// and expo-file-system is not currently installed in this project). A
// caller that doesn't pass a blob (or whose own pre-read failed) falls
// through to the original at-upload-time read below, unchanged.

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

// Exported (not just used for the internal retry decision below) so a
// screen's own catch block can tell a genuine network-ish failure apart
// from any OTHER error (an RLS/permission rejection, a missing bucket, a
// Postgres constraint, ...) -- see EditProfileScreen/OwnerAddCarScreen's
// own comment on why showing "check your connection" for a non-network
// error was a real, misleading bug: the actual Supabase/Postgres message is
// what a real fix (or a real support ticket) needs to see, not a generic
// guess that happens to be wrong.
export const isRetryableMessage = (message: string): boolean =>
  !isStaleLocalFileMessage(message) &&
  /network|timed out|fetch failed|timeout|abort|empty when read|socket|connection/i.test(message);

// A confirmed, reproducible root cause (device-log verified, not a network
// symptom): fetch() on the picked Android photo URI can return HTTP 404 when
// the OS has invalidated the picker's read grant on that file -- most
// commonly the Android 13+ system Photo Picker, which only guarantees the
// URI is readable for a short window around the pick, not indefinitely.
// Unlike a dropped-packet network failure, this is NOT transient: the exact
// same URI will return 404 again on every retry (retrying only wastes the
// user's time and the timeout budget), and it will not un-break itself by
// waiting -- the underlying file grant is gone. So this is deliberately
// excluded from isRetryableMessage above and given its own precise,
// actionable message instead of being retried 3x and then shown the same
// generic "check your connection" text that a real network failure gets
// (which was actively misleading here, per the confirmed device log: no
// network problem existed at all).
// Exported so the screens that show this error to the user (OwnerAddCarScreen,
// EditProfileScreen) can recognize it precisely instead of duplicating the
// "status 404" substring match, and show STALE_LOCAL_PHOTO_MESSAGE instead of
// a generic/misleading "check your connection" message.
export const STALE_LOCAL_PHOTO_MESSAGE = 'Selected photo is no longer available. Please select the photo again.';

// Matches both the raw "status 404" (before readUriAsBlobWithRetry converts
// it to STALE_LOCAL_PHOTO_MESSAGE) and the friendly message itself (once it's
// been wrapped by an outer catch, e.g. uploadImageIfLocalInternal's "Couldn't
// upload image: ..." or uploadCarImages' "Photo N of M failed: ...") -- so
// this stays correctly non-retryable and correctly identifiable no matter
// which layer is inspecting the message.
export const isStaleLocalFileMessage = (message: string): boolean =>
  /status 404/i.test(message) || message.includes(STALE_LOCAL_PHOTO_MESSAGE);

// Reads an on-device URI (file://... or content://...) into a Blob, with a
// pre-read session-freshness check, a bounded timeout, up to 3 attempts on
// transient failures, and 0-byte-blob detection (see the top-of-file
// comment for why each of these exists). Shared by every place in the app
// that turns a picked file into upload bytes -- including the pick-time
// pre-fetch in OwnerAddCarScreen/EditProfileScreen (see the Phase 1 comment
// above), which is exactly why this was already the right shared primitive
// to reuse rather than adding a second, parallel read path.
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
      const stale = isStaleLocalFileMessage(lastError.message);
      console.log(
        `VELORA_MEDIA_READ_ATTEMPT_FAILED: label=${label} attempt=${attempt}/${MAX_ATTEMPTS} error=${lastError.message}` +
          (stale ? ' (stale local file -- not retrying)' : ''),
      );
      const canRetry = attempt < MAX_ATTEMPTS && isRetryableMessage(lastError.message);
      if (canRetry) {
        await wait(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  // A stale/invalid local file (see isStaleLocalFileMessage above) gets a
  // precise, actionable message instead of the raw "status 404" text -- the
  // fix is "pick the photo again", not "check your connection", and showing
  // the wrong one is exactly what made this bug hard to diagnose from the
  // user-facing message alone.
  if (isStaleLocalFileMessage(lastError.message)) {
    throw new Error(STALE_LOCAL_PHOTO_MESSAGE);
  }
  throw lastError;
};

type UploadResult = { url: string; storagePath: string | null };

// A photo/avatar picked on-device: `uri` for display and extension/MIME
// detection, plus an optional `blob` already read at pick time (see the
// Phase 1 comment above). `blob` is omitted for an already-uploaded https
// URL (nothing to pre-read) or when a pick-time pre-read failed and the
// screen fell back to the original at-upload-time read.
export type PickedImage = { uri: string; blob?: Blob };

// Internal implementation shared by uploadImageIfLocal (public, URL-only
// return, used by uploadAvatar) and uploadCarImages (needs the storage path
// too, so a later failure in the same batch can clean up what already
// succeeded instead of leaving it orphaned in Storage).
const uploadImageIfLocalInternal = async (
  uri: string,
  bucket: string,
  path: string,
  preFetchedBlob?: Blob,
): Promise<UploadResult> => {
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
      // PHASE 1 IMAGE PIPELINE FIX -- reuse the exact blob read at pick time
      // on every attempt instead of re-reading `uri`. This is the real fix
      // for the confirmed stale-grant root cause: the bytes were already
      // safely captured the moment the picker returned, so a retry here
      // only ever needs to retry the storage.upload() network call itself,
      // never a URI read that could fail for reasons unrelated to the
      // network. Falls back to the original per-attempt read when no
      // pre-fetched blob is available, preserving prior behavior exactly
      // for that case.
      const blob = preFetchedBlob ?? (await readUriAsBlobWithRetry(uri, 'photo'));

      // DIAGNOSTIC -- isolates the "new row violates row-level security
      // policy" report seen after the stale-URI fix landed. The RLS policy
      // itself was already independently verified correct via a direct
      // curl-authenticated upload, so this checks the one thing that test
      // couldn't: whether THIS APP's own client actually has a live session
      // attached at the exact moment it calls storage.upload(), and whether
      // the path this upload is about to write to matches that session's
      // user. Deliberately logs booleans only -- never the session token,
      // the user id, or the file path.
      const { data: authState } = await supabase.auth.getSession();
      const hasSession = !!authState.session;
      const pathOwnerId = path.split('/')[0];
      const userIdMatchesPath = !!authState.session && authState.session.user.id === pathOwnerId;
      console.log(`VELORA_IMAGE_AUTH_STATE: hasSession=${hasSession} userIdMatchesPath=${userIdMatchesPath}`);

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

export const uploadImageIfLocal = async (
  uri: string,
  bucket: string,
  path: string,
  preFetchedBlob?: Blob,
): Promise<string> => (await uploadImageIfLocalInternal(uri, bucket, path, preFetchedBlob)).url;

// Uploads every local photo in `images` (passing through any whose `uri` is
// already a real URL), one at a time under `${bucket}/${ownerId}/...` so
// storage RLS (see supabase_migration_multidevice.sql section 9d) can scope
// writes to each user's own folder. Index-based path suffixes disambiguate
// multiple images from the same upload so they don't overwrite each other.
export const uploadCarImages = async (images: PickedImage[], ownerId: string): Promise<string[]> => {
  const uploaded: string[] = [];
  const uploadedPaths: string[] = [];

  for (let i = 0; i < images.length; i++) {
    try {
      const result = await uploadImageIfLocalInternal(
        images[i].uri,
        'car-photos',
        `${ownerId}/${Date.now()}_${i}`,
        images[i].blob,
      );
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
      throw new Error(`Photo ${i + 1} of ${images.length} failed: ${message}`);
    }
  }
  return uploaded;
};

export const uploadAvatar = async (uri: string, userId: string, preFetchedBlob?: Blob): Promise<string> =>
  uploadImageIfLocal(uri, 'avatars', `${userId}/${Date.now()}`, preFetchedBlob);

// OWNER VERIFICATION -- unlike every other upload above, `owner-id-documents`
// is a PRIVATE bucket (see 0020_owner_verifications.sql): a government ID
// photo must never be publicly readable by url guessing. Returns the
// storage PATH, not a public url -- callers must generate a short-lived
// signed url (supabase.storage.from('owner-id-documents').createSignedUrl(...))
// to actually display it, same pattern already used for chat-audio voice
// notes (see ConversationDetailScreen.VoiceMessageBubble).
export const uploadOwnerIdDocument = async (uri: string, userId: string, preFetchedBlob?: Blob): Promise<string> => {
  const result = await uploadImageIfLocalInternal(uri, 'owner-id-documents', `${userId}/${Date.now()}`, preFetchedBlob);
  if (!result.storagePath) {
    throw new Error('Could not determine the uploaded document path.');
  }
  return result.storagePath;
};
