// react-native-razorpay ships no TypeScript types of its own (plain JS, see
// node_modules/react-native-razorpay/RazorpayCheckout.js) and there is no
// @types/react-native-razorpay package either -- this is a minimal, hand-
// written ambient declaration covering only what SubscriptionScreen.tsx
// actually uses, matching that JS file's real behavior exactly (Checkout.open
// resolves with the success payload or rejects with { code, description }).
declare module 'react-native-razorpay' {
  export interface CheckoutOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    image?: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
  }

  export interface SuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface ErrorResponse {
    code: number;
    description: string;
  }

  export default class RazorpayCheckout {
    static open(options: CheckoutOptions): Promise<SuccessResponse>;
  }
}
