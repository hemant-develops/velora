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

// Reduces an ISO datetime string to the plain 'YYYY-MM-DD' calendar day it
// falls on in LOCAL time -- the same day toDayTimestamp above already
// normalizes to internally, just as a string instead of a timestamp. Used
// when a date needs to cross a boundary that only understands calendar
// days (e.g. a Postgres `date` column/parameter), so that day stays
// consistent with what this file's own local overlap check already treats
// as "the day" for that same ISO string.
export const toLocalDateOnly = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
