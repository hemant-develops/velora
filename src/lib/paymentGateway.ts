// M10 -- Payments abstraction boundary.
//
// VELORA has no real payment gateway configured anywhere in this project
// (no Stripe/Razorpay/PayU keys, SDK, or webhook handler exists). This
// module is the single seam where a real gateway integration would plug in
// later: swap the body of `processPayment` for a real charge-creation call
// (e.g. a Razorpay Order + signature-verified webhook, or a Stripe
// PaymentIntent confirmed client-side), while keeping this exact input/
// output contract so PaymentScreen and BookingsContext never need to
// change. Nothing outside this file should know or care whether a payment
// was actually processed by a real gateway or this mock.
//
// This module NEVER collects, transmits, or stores any card/UPI/bank
// credential -- it only ever receives the payment method the renter picked
// (a label like "UPI" or "Cash / Pay Later") and the amount already shown
// on the Payment screen. There is no card number/CVV/expiry field anywhere
// in this app, so there is nothing sensitive for this mock to mishandle.
export type PaymentMethodKey = 'upi' | 'card' | 'wallet' | 'cash';

export interface ProcessPaymentInput {
  bookingId: string;
  method: PaymentMethodKey;
  amount: number;
}

export interface ProcessPaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

const MOCK_PROCESSING_DELAY_MS = 900;

// A small, deliberately-visible simulated decline rate so the app's
// failure-state handling (Payment screen's retry path, Booking.paymentStatus
// = 'failed') is a real, exercised code path instead of dead code that
// always assumes success -- exactly what "handle pending/success/failure
// states clearly" requires when there's no real gateway to fail for real.
const MOCK_DECLINE_RATE = 0.06;

const generateMockTransactionId = (): string =>
  `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/**
 * Simulates submitting a payment to a gateway and waiting for its result.
 * Cash / Pay Later is never actually charged through the app -- there is
 * nothing to process now, so it resolves immediately with no simulated
 * delay or decline (the caller records this as `paymentStatus: 'unpaid'`,
 * due at pickup, never `'paid'`).
 */
export async function processPayment(input: ProcessPaymentInput): Promise<ProcessPaymentResult> {
  if (input.method === 'cash') {
    return { success: true };
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_PROCESSING_DELAY_MS));

  if (Math.random() < MOCK_DECLINE_RATE) {
    return {
      success: false,
      error: 'Your payment could not be processed. Please try a different method or try again.',
    };
  }

  return { success: true, transactionId: generateMockTransactionId() };
}
