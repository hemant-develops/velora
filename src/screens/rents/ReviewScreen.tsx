import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { FallbackImage } from '../../components/FallbackImage';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { useReviews } from '../../context/ReviewsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

const STARS = [1, 2, 3, 4, 5];
// Clears the absolutely-positioned footer button below the scroll content.
const FOOTER_CLEARANCE = 200;

export const ReviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getCarById, updateCarRating } = useCars();
  const { getBookingById } = useBookings();
  const { addReview, hasReviewedBooking } = useReviews();
  const car = getCarById(route.params.carId);
  const booking = getBookingById(route.params.bookingId);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  // Final-verification fix -- addReview() (ReviewsContext) has no data-layer
  // check of its own that the booking is this renter's, or that it's
  // actually completed; that was only ever enforced by "Write a Review"'s
  // visibility on Booking Details. Re-check both here, at the point the
  // review is actually created, so a foreign/guessed or not-yet-completed
  // bookingId can't be reviewed just by reaching this screen directly.
  const isEligible = !!booking && booking.renterId === user?.id && booking.status === 'completed';

  if (!car || !user || !isEligible) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Unable to load this booking" />
      </View>
    );
  }

  // Reaching this screen twice for the same booking (back-navigation, a
  // stale notification/deep link) should never let a second review through
  // -- show the same "already done" treatment other one-shot screens
  // (Report) use instead of re-rendering the form.
  if (hasReviewedBooking(route.params.bookingId)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Rate & Review" onBack={() => navigation.goBack()} />
        <EmptyState icon="checkmark-circle-outline" title="Already reviewed" subtitle="You've already submitted a review for this rental." />
      </View>
    );
  }

  const onSubmit = async () => {
    setSaving(true);
    const result = await addReview({
      bookingId: route.params.bookingId,
      carId: car.id,
      renterId: user.id,
      renterName: user.name,
      rating,
      comment: comment.trim(),
    });
    if (!result.success) {
      setSaving(false);
      if (result.error) Alert.alert('Unable to submit review', result.error);
      return;
    }
    await updateCarRating(car.id, rating);
    setSaving(false);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Rate & Review" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: FOOTER_CLEARANCE }}>
        <View style={[styles.carRow, shadows.sm]}>
          <FallbackImage uri={car.images[0]} style={styles.carImage} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.carMeta}>{car.category}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How was your rental?</Text>
        <View style={styles.starRow}>
          {STARS.map((s) => (
            <Pressable key={s} onPress={() => setRating(s)} hitSlop={6} accessibilityLabel={`Rate ${s} stars`}>
              <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={40} color={colors.star} style={{ marginRight: 8 }} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Write a review (optional)</Text>
        <InputField
          placeholder="Tell other renters about your experience..."
          value={comment}
          onChangeText={setComment}
          multiline
          style={{ height: 110, textAlignVertical: 'top' }}
        />
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton label="Submit Review" onPress={onSubmit} loading={saving} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  carRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center' },
  carImage: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  starRow: { flexDirection: 'row' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
});
