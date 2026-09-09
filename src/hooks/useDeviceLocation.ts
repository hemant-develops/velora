import * as Location from 'expo-location';

// Thin, reusable wrapper around expo-location so every place that needs the
// device's current city (the first-launch prompt, the Location Picker
// screen, "List a Car"'s pickup-location field, ...) shares one
// implementation instead of each screen copy-pasting its own
// permission/geocoding logic.

export type DeviceLocationResult =
  | { ok: true; label: string }
  | { ok: false; reason: 'permission-denied' | 'unavailable' };

// Reads the current permission state WITHOUT showing any OS prompt.
export const getForegroundPermissionStatus = () => Location.getForegroundPermissionsAsync();

// Shows the real, native Android/iOS permission dialog. Only ever call this
// from an explicit user action (a button tap) or the one-time first-launch
// check -- never on a timer/poll, so the person is never surprised by it and
// it never repeats itself indefinitely.
export const requestForegroundPermission = () => Location.requestForegroundPermissionsAsync();

// Resolves the device's current city/area as a short display label (e.g.
// "Jaipur, Rajasthan, India"). Assumes permission has already been granted --
// callers are expected to check/request permission first via the functions
// above, so this function's only failure mode is "the device couldn't get a
// GPS fix / reverse-geocode it" (`reason: 'unavailable'`), or the permission
// having been revoked in between (`reason: 'permission-denied'`).
export const detectCurrentLocationLabel = async (): Promise<DeviceLocationResult> => {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, reason: 'permission-denied' };
    }
    const position = await Location.getCurrentPositionAsync({});
    const [place] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const parts = [place?.city ?? place?.subregion, place?.region, place?.country].filter(Boolean);
    if (parts.length === 0) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, label: parts.join(', ') };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
};
