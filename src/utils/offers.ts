// VELORA's own real, functional promo codes -- NOT a page of fabricated
// third-party/bank cashback offers (the kind a reference app shows tied to
// payment partners VELORA doesn't have). Every code here actually reduces
// the real total computed in BookingScreen; there is no code listed
// anywhere that doesn't work when typed in.
export interface OfferCode {
  code: string;
  title: string;
  description: string;
  discountPercent: number; // whole number, e.g. 10 = 10% off
  maxDiscount: number; // cap in rupees, so a percentage never runs away on a big booking
  minSubtotal?: number; // optional floor on the pre-tax subtotal to qualify
}

export const VELORA_OFFERS: OfferCode[] = [
  {
    code: 'VELORA10',
    title: '10% off any booking',
    description: 'Get 10% off your subtotal, up to ₹300.',
    discountPercent: 10,
    maxDiscount: 300,
  },
  {
    code: 'WEEKEND20',
    title: '20% off longer trips',
    description: 'Get 20% off your subtotal, up to ₹500, on bookings of ₹1,500 or more.',
    discountPercent: 20,
    maxDiscount: 500,
    minSubtotal: 1500,
  },
  {
    code: 'VLRWELCOME',
    title: 'Welcome discount',
    description: 'Get 15% off your subtotal, up to ₹400.',
    discountPercent: 15,
    maxDiscount: 400,
  },
];

export const findOfferByCode = (rawCode: string): OfferCode | undefined => {
  const code = rawCode.trim().toUpperCase();
  if (!code) return undefined;
  return VELORA_OFFERS.find((o) => o.code === code);
};

export interface OfferApplyResult {
  success: boolean;
  discount: number;
  error?: string;
}

// Pure function so BookingScreen (and anywhere else that needs to preview
// or re-validate a code) always computes the exact same number.
export const applyOffer = (rawCode: string, subtotal: number): OfferApplyResult => {
  const offer = findOfferByCode(rawCode);
  if (!offer) return { success: false, discount: 0, error: "That promo code isn't valid." };
  if (offer.minSubtotal && subtotal < offer.minSubtotal) {
    return { success: false, discount: 0, error: `This code needs a booking subtotal of at least ₹${offer.minSubtotal}.` };
  }
  const discount = Math.min(Math.round((subtotal * offer.discountPercent) / 100), offer.maxDiscount);
  return { success: true, discount };
};
