import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useReviews } from '../../context/ReviewsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RateCustomer'>;

const STARS = [1, 2, 3, 4, 5];

// TWO-WAY REVIEWS -- Owner -> Customer. Mirrors ReviewScreen.tsx's
// structure deliberately (same star row, same optional-comment pattern) --
// this review is private (never shown on the public website, see
// 0029_two_way_reviews.sql), but the "genuine completed interaction only"
// requirement is identical, enforced the same way: hasReviewedCustomerForBooking
// gates re-entry, and the RLS insert check independently re-verifies this
// is really the owner's own completed booking with this exact customer.
export const RateCustomerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { addCustomerReview, hasReviewedCustomerForBooking } = useReviews();
  const { bookingId, customerId, customerName } = route.params;

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  if (hasReviewedCustomerForBooking(bookingId)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Rate Customer" onBack={() => navigation.goBack()} />
        <EmptyState icon="checkmark-circle-outline" title="Already reviewed" subtitle="You've already rated this customer for this rental." />
      </View>
    );
  }

  const onSubmit = async () => {
    if (saving) return;
    setSaving(true);
    const result = await addCustomerReview({ bookingId, customerId, rating, comment: comment.trim() });
    setSaving(false);
    if (!result.success) {
      if (result.error) Alert.alert('Unable to submit review', result.error);
      return;
    }
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Rate Customer" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>How was your experience with {customerName}?</Text>

        <Text style={styles.sectionTitle}>Overall rating</Text>
        <View style={styles.starRow}>
          {STARS.map((s) => (
            <Pressable key={s} onPress={() => setRating(s)} hitSlop={6} accessibilityLabel={`Rate ${s} stars`}>
              <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={40} color={colors.star} style={{ marginRight: 8 }} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <InputField
          placeholder="Communication, punctuality, vehicle return condition..."
          value={comment}
          onChangeText={setComment}
          multiline
          style={{ height: 110, textAlignVertical: 'top' }}
        />

        <PrimaryButton label="Submit" onPress={onSubmit} loading={saving} disabled={saving} style={{ marginTop: spacing.md }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  intro: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.md },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.md, marginBottom: spacing.sm },
  starRow: { flexDirection: 'row' },
});
