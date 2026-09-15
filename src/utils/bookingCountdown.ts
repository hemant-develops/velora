// PHASE 6 -- Countdown for a pending booking request.
//
// Every new "Request to Book" booking (see BookingsContext.createBooking)
// starts 'pending' and needs the owner to Confirm or Reject it. This gives
// both sides a concrete, shared expectation for how long that should take,
// instead of an indefinitely open-ended wait.
//
// DELIBERATELY DISPLAY-ONLY -- nothing here auto-rejects or auto-cancels a
// booking once the window passes (the same "flag the limitation, don't fake
// enforcement" choice already made for Car.bufferHours -- see that field's
// own comment in types/index.ts). A renter could already cancel their own
// pending request at any time before this existed (BookingDetailsScreen's
// existing Cancel Booking button, unconditionally available at 'pending');
// this just makes the timing expectation explicit instead of leaving it
// open-ended, and gives the owner a clear reason to act promptly.
export const RESPONSE_WINDOW_HOURS = 24;

export const getResponseDeadlineMs = (createdAt: string): number =>
  new Date(createdAt).getTime() + RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;

export const isResponseOverdue = (createdAt: string, now: number = Date.now()): boolean =>
  now >= getResponseDeadlineMs(createdAt);

// "18h 42m left" / "42m left" / "Response window has passed" -- never shows
// a negative duration or a stray "0h 0m".
export const formatResponseCountdown = (createdAt: string, now: number = Date.now()): string => {
  const remainingMs = getResponseDeadlineMs(createdAt) - now;
  if (remainingMs <= 0) return 'Response window has passed';
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left to respond`;
  return `${minutes}m left to respond`;
};
