// PHASE 2 -- Owner Duration Pricing.
//
// Single choke point that resolves the actual ₹ price for a given car +
// rental mode + duration (hours). This is what BookingScreen calls instead
// of the flat `activePrice * days` formula it used in Phase 1.

import { Car, RentalMode } from '../types';
import { durationHoursToBillableDays } from './duration';

// Legacy fallback -- the exact Phase 1 (and pre-Phase-1) formula: a flat
// per-day rate times the duration's billable-day count. This is what every
// car without owner-set duration pricing still uses, unchanged.
const legacyFlatPrice = (car: Car, mode: RentalMode, hours: number): number => {
  const flatPerDay = mode === 'self_drive' ? car.pricePerDay : car.driverPricePerDay;
  return flatPerDay * durationHoursToBillableDays(hours);
};

export const priceForDuration = (car: Car, mode: RentalMode, hours: number): number => {
  const table = car.durationPricing;
  if (!table) return legacyFlatPrice(car, mode, hours);

  const presetPrice =
    hours === 6
      ? table.price6h
      : hours === 12
        ? table.price12h
        : hours === 24
          ? table.price24h
          : hours === 48
            ? table.price48h
            : undefined;

  // A fixed preset price the owner set takes priority; anything else
  // (Custom, or a preset they left blank) is priced from the hourly rate.
  const selfDrivePrice = presetPrice != null ? presetPrice : Math.round(table.hourlyRate * hours);

  if (mode === 'self_drive') return selfDrivePrice;

  // With-driver: the owner only ever fills in ONE duration-pricing table
  // (self-drive) -- asking for a second, driver-specific table for every
  // duration would roughly double this form for a case (with-driver +
  // custom duration pricing) that's already a minority of listings. Instead
  // this scales the self-drive duration price by the exact same ratio the
  // app already derives between the two flat per-day rates (see
  // OwnerAddCarScreen's driverPrice auto-calc: `Math.round(price * 1.4)`
  // when the owner leaves "With Driver Price per Day" blank), so a car with
  // duration pricing set up still charges a sensible, proportional driver
  // price with no extra owner input required.
  const ratio = car.pricePerDay > 0 ? car.driverPricePerDay / car.pricePerDay : 1.4;
  return Math.round(selfDrivePrice * ratio);
};
