import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CustomerReview, OwnerReview, Review } from '../types';
import { generateId } from '../utils/format';
import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION -- reviews used to live only in this device's
// AsyncStorage (`velora.reviews.v1`), so a review left on one phone was
// invisible to anyone browsing that car on another phone. They now live in
// the real, shared `public.reviews` table (see
// supabase_migration_multidevice.sql) -- readable by any signed-in user
// (reviews are public within the app), insertable only by the renter who
// wrote them.

export interface AddReviewInput {
  bookingId: string;
  carId: string;
  renterId: string;
  renterName: string;
  rating: number;
  comment: string;
}

// M9 -- hardens Rate & Review against a double submission (e.g. the screen
// being reached twice for the same booking via back-navigation or a
// double-tap race) mirroring the { success, error } result contract
// BookingsContext's status-changing actions already use, instead of
// silently creating a second Review record for the same booking (which
// would double-count that booking in the car's rating/reviewCount).
export interface AddReviewResult {
  success: boolean;
  error?: string;
  review?: Review;
}

// TWO-WAY REVIEWS -- Customer -> Owner/Store.
export interface AddOwnerReviewInput {
  bookingId: string;
  ownerId: string;
  rating: number;
  comment: string;
}

// TWO-WAY REVIEWS -- Owner -> Customer.
export interface AddCustomerReviewInput {
  bookingId: string;
  customerId: string;
  rating: number;
  comment: string;
}

export interface AddOwnerOrCustomerReviewResult {
  success: boolean;
  error?: string;
}

interface ReviewsContextValue {
  reviews: Review[];
  addReview: (input: AddReviewInput) => Promise<AddReviewResult>;
  getReviewsForCar: (carId: string) => Review[];
  hasReviewedBooking: (bookingId: string) => boolean;
  getReviewForBooking: (bookingId: string) => Review | undefined;
  refreshReviews: () => Promise<void>;
  // TWO-WAY REVIEWS
  addOwnerReview: (input: AddOwnerReviewInput) => Promise<AddOwnerOrCustomerReviewResult>;
  hasReviewedOwnerForBooking: (bookingId: string) => boolean;
  addCustomerReview: (input: AddCustomerReviewInput) => Promise<AddOwnerOrCustomerReviewResult>;
  hasReviewedCustomerForBooking: (bookingId: string) => boolean;
}

const ReviewsContext = createContext<ReviewsContextValue | undefined>(undefined);

interface ReviewRow {
  id: string;
  booking_id: string;
  car_id: string;
  renter_id: string;
  renter_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

const rowToReview = (row: ReviewRow): Review => ({
  id: row.id,
  bookingId: row.booking_id,
  carId: row.car_id,
  renterId: row.renter_id,
  renterName: row.renter_name,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
});

interface OwnerReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  owner_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

const rowToOwnerReview = (row: OwnerReviewRow): OwnerReview => ({
  id: row.id,
  bookingId: row.booking_id,
  reviewerId: row.reviewer_id,
  ownerId: row.owner_id,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
});

interface CustomerReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  customer_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

const rowToCustomerReview = (row: CustomerReviewRow): CustomerReview => ({
  id: row.id,
  bookingId: row.booking_id,
  reviewerId: row.reviewer_id,
  customerId: row.customer_id,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
});

export const ReviewsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ownerReviews, setOwnerReviews] = useState<OwnerReview[]>([]);
  const [customerReviews, setCustomerReviews] = useState<CustomerReview[]>([]);

  const fetchReviews = async () => {
    const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log(`VELORA_REVIEWS_FETCH_ERROR: ${error.message}`);
      return;
    }
    setReviews(((data ?? []) as ReviewRow[]).map(rowToReview));
  };

  // TWO-WAY REVIEWS -- owner_reviews is authenticated-readable (same as
  // `reviews`); customer_reviews' own RLS already scopes a fetch-all to
  // exactly "reviews about me" + "reviews I wrote", so no extra client-side
  // filtering is needed for either.
  const fetchOwnerReviews = async () => {
    const { data, error } = await supabase.from('owner_reviews').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log(`VELORA_OWNER_REVIEWS_FETCH_ERROR: ${error.message}`);
      return;
    }
    setOwnerReviews(((data ?? []) as OwnerReviewRow[]).map(rowToOwnerReview));
  };

  const fetchCustomerReviews = async () => {
    const { data, error } = await supabase.from('customer_reviews').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log(`VELORA_CUSTOMER_REVIEWS_FETCH_ERROR: ${error.message}`);
      return;
    }
    setCustomerReviews(((data ?? []) as CustomerReviewRow[]).map(rowToCustomerReview));
  };

  useEffect(() => {
    fetchOwnerReviews();
    fetchCustomerReviews();
    const { data: sub2 } = supabase.auth.onAuthStateChange(() => {
      fetchOwnerReviews();
      fetchCustomerReviews();
    });
    const ownerChannel = supabase
      .channel('owner_reviews_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owner_reviews' }, () => fetchOwnerReviews())
      .subscribe();
    const customerChannel = supabase
      .channel('customer_reviews_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_reviews' }, () => fetchCustomerReviews())
      .subscribe();
    return () => {
      sub2.subscription.unsubscribe();
      supabase.removeChannel(ownerChannel);
      supabase.removeChannel(customerChannel);
    };
  }, []);

  useEffect(() => {
    fetchReviews();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchReviews();
    });
    const channel = supabase
      .channel('reviews_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        fetchReviews();
      })
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const addReview = async (input: AddReviewInput): Promise<AddReviewResult> => {
    if (reviews.some((r) => r.bookingId === input.bookingId)) {
      return { success: false, error: "You've already reviewed this rental." };
    }
    const review: Review = {
      id: generateId('review'),
      createdAt: new Date().toISOString(),
      ...input,
    };
    const { error } = await supabase.from('reviews').insert({
      id: review.id,
      booking_id: review.bookingId,
      car_id: review.carId,
      renter_id: review.renterId,
      renter_name: review.renterName,
      rating: review.rating,
      comment: review.comment,
      created_at: review.createdAt,
    });
    if (error) {
      console.log(`VELORA_REVIEWS_INSERT_ERROR: ${error.message}`);
      // A unique constraint on booking_id means a race (double submit)
      // fails here with a friendly, specific reason rather than a raw DB
      // error reaching the screen.
      if (error.code === '23505') {
        return { success: false, error: "You've already reviewed this rental." };
      }
      return { success: false, error: "We couldn't submit your review right now. Please try again." };
    }
    setReviews((prev) => [review, ...prev]);
    return { success: true, review };
  };

  // TWO-WAY REVIEWS -- Customer -> Owner/Store. reviewer_id is read from
  // the caller's OWN session (never trusted from the input object) since
  // owner_reviews_insert's RLS requires it to exactly equal auth.uid().
  const addOwnerReview = async (input: AddOwnerReviewInput): Promise<AddOwnerOrCustomerReviewResult> => {
    if (ownerReviews.some((r) => r.bookingId === input.bookingId)) {
      return { success: false, error: "You've already reviewed this owner for this rental." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You must be signed in to leave a review.' };

    const { error } = await supabase.from('owner_reviews').insert({
      id: generateId('orev'),
      booking_id: input.bookingId,
      reviewer_id: user.id,
      owner_id: input.ownerId,
      rating: input.rating,
      comment: input.comment,
    });
    if (error) {
      console.log(`VELORA_OWNER_REVIEW_INSERT_ERROR: ${error.message}`);
      if (error.code === '23505') {
        return { success: false, error: "You've already reviewed this owner for this rental." };
      }
      return { success: false, error: "We couldn't submit your review right now. Please try again." };
    }
    await fetchOwnerReviews();
    return { success: true };
  };

  // TWO-WAY REVIEWS -- Owner -> Customer. Same reviewer_id-from-session
  // reasoning as addOwnerReview above.
  const addCustomerReview = async (input: AddCustomerReviewInput): Promise<AddOwnerOrCustomerReviewResult> => {
    if (customerReviews.some((r) => r.bookingId === input.bookingId)) {
      return { success: false, error: "You've already reviewed this customer for this rental." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You must be signed in to leave a review.' };

    const { error } = await supabase.from('customer_reviews').insert({
      id: generateId('crev'),
      booking_id: input.bookingId,
      reviewer_id: user.id,
      customer_id: input.customerId,
      rating: input.rating,
      comment: input.comment,
    });
    if (error) {
      console.log(`VELORA_CUSTOMER_REVIEW_INSERT_ERROR: ${error.message}`);
      if (error.code === '23505') {
        return { success: false, error: "You've already reviewed this customer for this rental." };
      }
      return { success: false, error: "We couldn't submit your review right now. Please try again." };
    }
    await fetchCustomerReviews();
    return { success: true };
  };

  const value = useMemo<ReviewsContextValue>(
    () => ({
      reviews,
      addReview,
      getReviewsForCar: (carId) =>
        reviews.filter((r) => r.carId === carId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      hasReviewedBooking: (bookingId) => reviews.some((r) => r.bookingId === bookingId),
      getReviewForBooking: (bookingId) => reviews.find((r) => r.bookingId === bookingId),
      refreshReviews: fetchReviews,
      addOwnerReview,
      hasReviewedOwnerForBooking: (bookingId) => ownerReviews.some((r) => r.bookingId === bookingId),
      addCustomerReview,
      hasReviewedCustomerForBooking: (bookingId) => customerReviews.some((r) => r.bookingId === bookingId),
    }),
    [reviews, ownerReviews, customerReviews],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
};

export const useReviews = (): ReviewsContextValue => {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error('useReviews must be used within a ReviewsProvider');
  return ctx;
};
