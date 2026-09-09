import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import { Review } from '../types';
import { generateId } from '../utils/format';

const REVIEWS_KEY = 'velora.reviews.v1';

export interface AddReviewInput {
  bookingId: string;
  carId: string;
  renterId: string;
  renterName: string;
  rating: number;
  comment: string;
}

interface ReviewsContextValue {
  reviews: Review[];
  addReview: (input: AddReviewInput) => Promise<Review>;
  getReviewsForCar: (carId: string) => Review[];
  hasReviewedBooking: (bookingId: string) => boolean;
  getReviewForBooking: (bookingId: string) => Review | undefined;
}

const ReviewsContext = createContext<ReviewsContextValue | undefined>(undefined);

export const ReviewsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(REVIEWS_KEY);
      if (raw) setReviews(JSON.parse(raw));
    })();
  }, []);

  const persist = async (next: Review[]) => {
    setReviews(next);
    await storage.setItem(REVIEWS_KEY, JSON.stringify(next));
  };

  const addReview = async (input: AddReviewInput): Promise<Review> => {
    const review: Review = {
      id: generateId('review'),
      createdAt: new Date().toISOString(),
      ...input,
    };
    await persist([review, ...reviews]);
    return review;
  };

  const value = useMemo<ReviewsContextValue>(
    () => ({
      reviews,
      addReview,
      getReviewsForCar: (carId) =>
        reviews.filter((r) => r.carId === carId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      hasReviewedBooking: (bookingId) => reviews.some((r) => r.bookingId === bookingId),
      getReviewForBooking: (bookingId) => reviews.find((r) => r.bookingId === bookingId),
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
