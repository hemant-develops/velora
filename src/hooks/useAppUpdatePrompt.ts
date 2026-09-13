import { useEffect } from 'react';
import * as Updates from 'expo-updates';

// AUTOMATIC OTA CHECK -- fires exactly once per app open. This only ever
// calls checkForUpdateAsync(): it never downloads anything and never shows
// any UI itself. checkForUpdateAsync() updates the native expo-updates
// state machine that Updates.useUpdates() reads, and UpdateBanner (mounted
// once at the app root) is subscribed to that same state machine -- so the
// moment a newer compatible update is found, UpdateBanner picks it up on
// its own and shows the "Download update" prompt. No separate wiring
// needed here.
//
// `Updates.isEnabled` is false in Expo Go and any local dev-client run --
// there's no published update channel to check against -- so this
// silently does nothing there and only ever matters in a real EAS
// build/APK, exactly where it's needed.
//
// A failed check here (no connection, nothing published yet, etc.) is
// completely normal on the silent automatic path and must never interrupt
// the app opening normally -- see requirement "if the update check or
// download fails, the existing app continues working normally".
export const useAppUpdatePrompt = () => {
  useEffect(() => {
    // Diagnostic breadcrumb, always logged (not just on error) -- visible via
    // `adb logcat | grep VELORA_UPDATE`. This is the only way to tell from
    // outside the device whether this launch is ALREADY running an update
    // that was downloaded and silently applied by expo-updates' own default
    // background behavior before this component ever mounted -- see
    // UpdateBanner's file comment for why that matters. If updateId here
    // already equals the update you just published, the publish worked and
    // was already applied; there was never anything left for the banner to
    // offer on this particular launch.
    console.log(
      `VELORA_UPDATE_STARTUP: enabled=${Updates.isEnabled} channel=${Updates.channel ?? 'n/a'} ` +
        `runtimeVersion=${Updates.runtimeVersion ?? 'n/a'} updateId=${Updates.updateId ?? 'n/a'} ` +
        `isEmbeddedLaunch=${Updates.isEmbeddedLaunch}`,
    );
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync()
      .then((result: { isAvailable: boolean; manifest?: { id?: string } }) => {
        console.log(
          result.isAvailable
            ? `VELORA_UPDATE_CHECK_RESULT: available manifestId=${result.manifest?.id ?? 'n/a'}`
            : 'VELORA_UPDATE_CHECK_RESULT: not available',
        );
      })
      .catch((err) => {
        console.log(`VELORA_UPDATE_CHECK_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });
  }, []);
};

// Manual counterpart used by ProfileScreen's "Check for Updates" row. Same
// underlying check as the automatic one above -- the only difference is
// that someone explicitly asked, so the outcome is worth telling them
// about instead of staying silent:
// - not enabled (dev/Expo Go build) -> explain there's nothing to check
// - available -> nothing to say here; UpdateBanner will show the download
//   prompt on its own, driven by the same state machine this call updates
// - not available -> "you're up to date"
// - failed -> "couldn't check, try again"
// The caller (ProfileScreen) owns exactly how each outcome is surfaced.
export const checkForAppUpdateManually = async (): Promise<{
  ok: boolean;
  available: boolean;
  message?: string;
}> => {
  if (!Updates.isEnabled) {
    return {
      ok: false,
      available: false,
      message:
        "This build isn't running from a published update channel (e.g. a local development build), so there's nothing to check here.",
    };
  }

  try {
    const check = await Updates.checkForUpdateAsync();
    return { ok: true, available: check.isAvailable };
  } catch (err) {
    console.log(`VELORA_UPDATE_CHECK_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return { ok: false, available: false, message: 'Please check your connection and try again.' };
  }
};
