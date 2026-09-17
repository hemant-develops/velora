const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Standard great-circle (haversine) distance between two lat/lng points, in
// kilometers. The only distance calculation in the app -- shared so "Near
// Me" (HomeScreen) and any future distance-based feature don't each
// reimplement (and potentially drift from) the same formula.
export const haversineDistanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
};

export const NEAR_ME_RADIUS_KM = 50;
