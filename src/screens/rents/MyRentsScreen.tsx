import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useBookings } from '../../context/BookingsContext';
import { useCars } from '../../context/CarsContext';
import { useReviews } from '../../context/ReviewsContext';
import { RentalCard } from '../../components/RentalCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { BookingStatus } from '../../types';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { OwnerDashboardScreen } from '../owner/OwnerDashboardScreen';

type TabKey = 'upcoming' | 'active' | 'completed';

const TABS: { key: TabKey; label: string; statuses: BookingStatus[] }[] = [
  // A booking still awaiting the owner's confirmation is grouped with
  // "Upcoming" rather than getting its own tab — the card's own status
  // badge (see RentalCard) already distinguishes Pending from Confirmed,
  // so this keeps the tab bar exactly as it was, no new tab to make room
  // for.
  { key: 'upcoming', label: 'Upcoming', statuses: ['pending', 'upcoming'] },
  { key: 'active', label: 'Active', statuses: ['active'] },
  { key: 'completed', label: 'Completed', statuses: ['completed', 'cancelled', 'rejected'] },
];

const RenterRents: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user } = useAuth();
  const navigation = useAppNavigation();
  const { getBookingsForRenter } = useBookings();
  const { getCarById } = useCars();
  const { hasReviewedBooking, getReviewForBooking } = useReviews();
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

  if (!user) return null;

  const allBookings = getBookingsForRenter(user.id);
  const activeStatuses = TABS.find((t) => t.key === activeTab)!.statuses;
  const filtered = allBookings.filter((b) => activeStatuses.includes(b.status));

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: tabBarClearance }}
      data={filtered}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <Text style={typography.displayMd}>My Rents</Text>
          <View style={styles.tabRow}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tab, activeTab === tab.key ? styles.tabActive : undefined]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : undefined]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const isCompleted = item.status === 'completed';
        const review = getReviewForBooking(item.id);

        return (
          <View style={{ marginBottom: spacing.md }}>
            <RentalCard
              booking={item}
              car={getCarById(item.carId)}
              onPress={() => navigation.navigate('BookingDetails', { bookingId: item.id })}
              style={{ marginBottom: 0 }}
            />
            {isCompleted ? (
              hasReviewedBooking(item.id) ? (
                <View style={styles.reviewedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.reviewedText}>
                    You rated this {review?.rating ?? ''}/5{review?.comment ? ' · review submitted' : ''}
                  </Text>
                </View>
              ) : (
                <PrimaryButton
                  label="Rate & Review"
                  onPress={() => navigation.navigate('Review', { bookingId: item.id, carId: item.carId })}
                  variant="outline"
                  size="sm"
                  style={{ marginTop: spacing.xs }}
                />
              )
            ) : null}
          </View>
        );
      }}
      ListEmptyComponent={
        <EmptyState icon="calendar-outline" title="No rentals here" subtitle="Book a car from Home to see it show up in this tab." />
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.onPrimary },
  tabText: { ...typography.titleMd, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  reviewedRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, paddingHorizontal: 4 },
  reviewedText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 6 },
});

export const MyRentsScreen: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'owner') return <OwnerDashboardScreen />;
  return <RenterRents />;
};
