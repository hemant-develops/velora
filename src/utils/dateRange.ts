// A small, dependency-free helper for detecting whether two inclusive date
// ranges overlap at all. Comparisons are done at day granularity (clock
// time is ignored) since it's the rental *day* that determines whether a
// car is available, not the exact pickup/drop-off hour.
const toDayTimestamp = (iso: string): number => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Handles every case two inclusive ranges [startA, endA] and [startB, endB]
// can be in relative to each other: identical ranges, A starting inside B,
// A ending inside B, A fully containing B, and B fully containing A. Two
// ranges only fail to overlap when one ends strictly before the other
// starts — so the single inequality below covers all five cases.
export const dateRangesOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
  const aStart = toDayTimestamp(startA);
  const aEnd = toDayTimestamp(endA);
  const bStart = toDayTimestamp(startB);
  const bEnd = toDayTimestamp(endB);
  return aStart <= bEnd && bStart <= aEnd;
};
