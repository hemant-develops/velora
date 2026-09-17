// Same haversine formula as the mobile app's src/utils/geo.ts, kept as its
// own small copy here rather than a shared package -- this is a separate
// deployable project with its own dependency tree, and the formula is
// simple enough that duplicating it is cheaper than coupling two unrelated
// build pipelines together for one function.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export const haversineDistanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
};
