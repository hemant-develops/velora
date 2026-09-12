import React, { useMemo, useState } from 'react';
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
import { TripsListSkeleton } from '../../components/SkeletonLoader';
import { BookingStatus } from '../../types';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { OwnerDashboardScreen } from '../owner/OwnerDashboardScreen';

type TabKey = 'upcoming' | 'active' | 'completed' | 'cancelled';

const TABS: { key: TabKey; label: string; statuses: BookingStatus[]; emptySubtitle: string }[] = [
  // A booking still awaiting the owner's confirmation is grouped with
  // "Upcoming" rather than getting its own tab — the card's own status
  // badge (see RentalCard) already distinguishes Pending from Confirmed,
  // so this keeps the tab bar exactly as it was, no new tab to make room
  // for.
  {
    key: 'upcoming',
    label: 'Upcoming',
    statuses: ['pending', 'upcoming'],
    emptySubtitle: 'Book a car from Home to see it show up here.',
  },
  { key: 'active', label: 'Active', statuses: ['active'], emptySubtitle: 'Rentals currently in progress will show up here.' },
  {
    key: 'completed',
    label: 'Completed',
    statuses: ['completed'],
    emptySubtitle: 'Rentals you’ve finished will show up here.',
  },
  // M8 -- previously folded into "Completed", which made a rental history
  // that never happened (rejected/cancelled) visually indistinguishable
  // from one that actually ran its full course. Split into its own tab per
  // the M8 rental-history requirement; rejected and cancelled stay grouped
  // together here since both mean "this booking never happened" from the
  // renter's point of view -- the card's own status badge (see RentalCard)
  // still shows which of the two it was.
  {
    key: 'cancelled',
    label: 'Cancelled',
    statuses: ['cancelled', 'rejected'],
    emptySubtitle: 'Cancelled or declined bookings will show up here.',
  },
];

const RenterRents: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user } = useAuth();
  const navigation = useAppNavigation();
  const { getBookingsForRenter, isLoading: bookingsLoading } = useBookings();
  const { getCarById } = useCars();
  const { hasReviewedBooking, getReviewForBooking } = useReviews();
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

  // Memoized (same pattern as BookingScreen.getAvailableQuantity) so this
  // -- and the VELORA_BOOKING_USER_RENTALS log inside it -- only
  // recomputes when the renter's bookings actually change or the user id
  // changes, not on every unrelated render of this screen (e.g. switching
  // tabs below only touches local `activeTab` state). Reads directly from
  // BookingsContext's own canonical state -- no separate store here.
  const allBookings = useMemo(
    () => (user ? getBookingsForRenter(user.id) : []),
    [getBookingsForRenter, user],
  );

  if (!user) return null;

  // M8 -- bookings load from Supabase asynchronously, same as
  // CarsContext's cars. Without this gate, a renter with real rental
  // history would briefly see the wrong "No rentals here" empty state on
  // every cold start, before their bookings have actually loaded in.
  if (bookingsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TripsListSkeleton topInset={insets.top} />
      </View>
    );
  }

  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;
  const filtered = allBookings.filter((b) => activeTabMeta.statuses.includes(b.status));

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
        <EmptyState
          icon="calendar-outline"
          title="No rentals here"
          subtitle={activeTabMeta.emptySubtitle}
          // B3.5 -- only on the Upcoming tab: a renter with zero bookings has
          // nowhere else on this screen to go find a car. The other tabs
          // (Active/Completed/Cancelled) are just describing history that
          // hasn't happened yet, so a "browse" nudge there would be noise.
          actionLabel={activeTab === 'upcoming' ? 'Browse Cars' : undefined}
          onAction={activeTab === 'upcoming' ? () => navigation.navigate('Main', { screen: 'HomeTab' }) : undefined}
        />
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
