import { Car } from '../types';

// A car's inventory count. undefined means the listing predates the
// quantity field (or a brand-new listing left it unset) -- both cases
// default to a single physical unit, exactly the same backward-compatible
// pattern Car.isActive already uses elsewhere in this app.
export const getCarQuantity = (car: Car): number => car.quantity ?? 1;
