// PHASE 1 -- Booking Duration System (hours-first model).
//
// The whole point of this file is real epoch-millisecond arithmetic, never
// calendar-day increments -- `computeDropoff` adds `hours * 3_600_000` ms to
// the pickup Date's own getTime(), so it is automatically correct across a
// midnight rollover, a month boundary, or a DST transition (JS Date's
// getTime()/setTime() operate on absolute UTC instants; only display
// formatting is ever timezone-sensitive, and this file never formats
// anything). This deliberately replaces the old "+1 calendar day" pattern
// BookingScreen used to use for its default drop-off date.

export const MIN_DURATION_HOURS = 6;

// The four quick-select presets from the spec, in display order. 'custom'
// is handled separately by the UI (DurationSelector) -- it isn't a fixed
// hour count, so it doesn't belong in this list.
export const DURATION_PRESETS_HOURS = [6, 12, 24, 48] as const;
export type DurationPresetHours = (typeof DURATION_PRESETS_HOURS)[number];

export const DEFAULT_DURATION_HOURS: DurationPresetHours = 24;

// Adds `hours` to `pickup` using plain epoch-ms arithmetic. Never uses
// setDate()/setHours() day-stepping, so it can never "round trip" through a
// calendar day incorrectly (the historical bug class this file exists to
// avoid) -- e.g. 15 Sep 10:00 AM + 30 hours is exactly 16 Sep 4:00 PM, not
// "16 Sep + 1 more day at the same clock time".
export const computeDropoff = (pickup: Date, hours: number): Date => new Date(pickup.getTime() + hours * 3_600_000);

// Inverse of computeDropoff, rounded to the nearest whole hour -- used only
// to re-derive a duration for display/validation when two absolute instants
// are already known (there is no such call site yet in Phase 1, but this is
// the correct, symmetric counterpart to computeDropoff and cheap to keep
// alongside it).
export const hoursBetween = (pickup: Date, dropoff: Date): number =>
  Math.round((dropoff.getTime() - pickup.getTime()) / 3_600_000);

// Human-readable duration label matching the spec's own examples ("24
// Hours", "30 Hours") -- deliberately hours-only (never "1 day 6 hours"),
// since the whole product direction here is moving away from day-based
// framing. Always plural-safe.
export const formatDurationHours = (hours: number): string => `${hours} Hour${hours === 1 ? '' : 's'}`;

// Pricing in this phase must keep using the EXISTING per-day price
// architecture unchanged (see BookingScreen -- Phase 2 is where real
// duration-based owner pricing gets introduced). This is the one, explicit
// place that bridges "hours the renter picked" to "days the existing price
// formula expects", so it's never silently duplicated: a 6-hour or 20-hour
// booking still rounds up to a full day's price (the same way a hotel
// checkout-past-noon charge works), never a fraction of one.
export const durationHoursToBillableDays = (hours: number): number => Math.max(Math.ceil(hours / 24), 1);

export const isValidDurationHours = (hours: number): boolean =>
  Number.isFinite(hours) && Number.isInteger(hours) && hours >= MIN_DURATION_HOURS;
