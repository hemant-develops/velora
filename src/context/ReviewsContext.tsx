import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Review } from '../types';
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

interface ReviewsContextValue {
  reviews: Review[];
  addReview: (input: AddReviewInput) => Promise<AddReviewResult>;
  getReviewsForCar: (carId: string) => Review[];
  hasReviewedBooking: (bookingId: string) => boolean;
  getReviewForBooking: (bookingId: string) => Review | undefined;
  refreshReviews: () => Promise<void>;
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

export const ReviewsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reviews, setReviews] = useState<Review[]>([]);

  const fetchReviews = async () => {
    const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log(`VELORA_REVIEWS_FETCH_ERROR: ${error.message}`);
      return;
    }
    setReviews(((data ?? []) as ReviewRow[]).map(rowToReview));
  };

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

  const value = useMemo<ReviewsContextValue>(
    () => ({
      reviews,
      addReview,
      getReviewsForCar: (carId) =>
        reviews.filter((r) => r.carId === carId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      hasReviewedBooking: (bookingId) => reviews.some((r) => r.bookingId === bookingId),
      getReviewForBooking: (bookingId) => reviews.find((r) => r.bookingId === bookingId),
      refreshReviews: fetchReviews,
    }),
    [reviews],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
};

export const useReviews = (): ReviewsContextValue => {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error('useReviews must be used within a ReviewsProvider');
  return ctx;
};
