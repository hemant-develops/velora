import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { EmptyState } from '../../components/EmptyState';
import { OwnerDashboardSkeleton } from '../../components/SkeletonLoader';
import { Rating } from '../../components/Rating';
import { FallbackImage } from '../../components/FallbackImage';
import { PrimaryButton } from '../../components/PrimaryButton';
import { formatCurrency, formatShortDate } from '../../utils/format';
import { dateRangesOverlap } from '../../utils/dateRange';
import { getCarQuantity } from '../../utils/inventory';
import { showToast } from '../../utils/toast';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { AppUser, Booking, BookingStatus, Car } from '../../types';

type TabKey = 'listings' | 'requests' | 'earnings';

const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'Pending', color: colors.warning, bg: colors.warningBg, icon: 'time-outline' },
  upcoming: { label: 'Confirmed', color: colors.info, bg: colors.infoBg, icon: 'checkmark-circle-outline' },
  active: { label: 'Active', color: colors.success, bg: colors.successBg, icon: 'car-sport-outline' },
  completed: { label: 'Completed', color: colors.textSecondary, bg: colors.surface, icon: 'checkmark-done-outline' },
  cancelled: { label: 'Cancelled', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle-outline' },
  rejected: { label: 'Declined', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle-outline' },
};

const isSameMonth = (isoDate: string, ref: Date) => {
  const d = new Date(isoDate);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
};

export const OwnerDashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user, getUserById } = useAuth();
  const navigation = useAppNavigation();
  const { getCarsByOwner, updateOwnerCar, removeOwnerCar, isLoaded: carsLoaded } = useCars();
  const { getBookingsForCars, isLoading: bookingsLoading } = useBookings();
  const [tab, setTab] = useState<TabKey>('listings');

  const myCars = useMemo(() => (user ? getCarsByOwner(user.id) : []), [user, getCarsByOwner]);
  const myCarIds = useMemo(() => myCars.map((c) => c.id), [myCars]);
  const requests = useMemo(
    () =>
      getBookingsForCars(myCarIds).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [getBookingsForCars, myCarIds],
  );

  const now = useMemo(() => new Date(), []);
  const completedBookings = useMemo(() => requests.filter((r) => r.status === 'completed'), [requests]);
  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;
  const activeBookings = requests.filter((r) => r.status === 'upcoming' || r.status === 'active').length;
  const totalEarnings = completedBookings.reduce((sum, r) => sum + r.total, 0);
  const thisMonthEarnings = completedBookings
    .filter((r) => isSameMonth(r.createdAt, now))
    .reduce((sum, r) => sum + r.total, 0);
  const pendingPayout = requests
    .filter((r) => r.status === 'upcoming' || r.status === 'active')
    .reduce((sum, r) => sum + r.total, 0);
  // Every car this owner has is deliberately hidden — worth calling out
  // clearly since it means they currently can't receive any new bookings
  // at all, without ever disabling/hiding the owner's account itself.
  const allCarsInactive = myCars.length > 0 && myCars.every((c) => c.isActive === false);

  // "Booked" on the dashboard summary is deliberately date-independent (a
  // listing here isn't scoped to any particular date range the way the
  // booking flow is) -- it's a snapshot of how many of this car's units are
  // held by a pending/upcoming/active booking covering TODAY specifically,
  // which is the one date that always makes sense to show at a glance.
  const todayIso = useMemo(() => new Date().toISOString(), []);
  const getBookedNowCount = (carId: string) =>
    requests.filter(
      (r) =>
        r.carId === carId &&
        (r.status === 'pending' || r.status === 'upcoming' || r.status === 'active') &&
        dateRangesOverlap(r.pickupDate, r.dropoffDate, todayIso, todayIso),
    ).length;

  // M10 -- lightweight owner insights, all derived from data already loaded
  // above (myCars/requests) -- no new store, no new service, and nothing
  // beyond what the dashboard already computes for its other tabs.
  const avgBookingValue = completedBookings.length > 0 ? Math.round(totalEarnings / completedBookings.length) : 0;
  const totalUnits = useMemo(() => myCars.reduce((sum, c) => sum + getCarQuantity(c), 0), [myCars]);
  const bookedUnitsNow = useMemo(
    () => myCars.reduce((sum, c) => sum + getBookedNowCount(c.id), 0),
    [myCars, requests, todayIso],
  );
  const occupancyPercent = totalUnits > 0 ? Math.round((bookedUnitsNow / totalUnits) * 100) : 0;

  const onToggleCarActive = async (car: Car, next: boolean) => {
    // MULTI-DEVICE MIGRATION -- updateOwnerCar now writes to Supabase and
    // can genuinely throw (a network hiccup). Without this try/catch that
    // was an unhandled promise rejection with no feedback -- the switch
    // would look like it toggled (or not) with no explanation either way.
    try {
      await updateOwnerCar(car.id, { isActive: next });
      showToast(next ? 'Car is now visible to users' : 'Car hidden from users');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_TOGGLE_CAR_ACTIVE_FAILED: ${message}`);
      Alert.alert("Couldn't update this listing", 'Please check your connection and try again.');
    }
  };

  // Every booking references its car only by carId (car.ownerId is how the
  // owner is resolved — see BookingsContext) — there is no separate,
  // duplicate ownerId stored on the booking itself. That's safe as long as
  // a car with booking history can never disappear out from under it: once
  // gone, getCarById(booking.carId) returns undefined everywhere (Booking
  // Details, My Rents, Owner Dashboard), which silently breaks the
  // owner/renter perspective on that booking (e.g. an owner's own past
  // booking would render as if they were the renter). Rather than adding a
  // redundant ownerId field to Booking, this guards the one place that
  // could break that guarantee: permanently deleting a still-referenced
  // car. A car with no booking history at all can still be removed
  // outright; one with history is guided to the existing Active/Inactive
  // toggle instead, which already preserves every booking untouched.
  const onRemoveCar = (car: Car) => {
    const carBookings = requests.filter((r) => r.carId === car.id);
    if (carBookings.length > 0) {
      Alert.alert(
        'Cannot Remove This Listing',
        'This car has booking history, so removing it would break those bookings. Turn it Inactive instead to hide it from renters while keeping your booking history intact.',
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert('Remove Listing', `Remove ${car.name} from your listings? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // MULTI-DEVICE MIGRATION -- removeOwnerCar now deletes from
          // Supabase and can genuinely throw (a network hiccup). Without
          // this catch that was an unhandled promise rejection with no
          // feedback -- the listing would appear to still be there with no
          // explanation why "Remove" didn't seem to work.
          removeOwnerCar(car.id).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.log(`VELORA_REMOVE_CAR_FAILED: ${message}`);
            Alert.alert("Couldn't remove this listing", 'Please check your connection and try again.');
          });
        },
      },
    ]);
  };

  if (!user) return null;

  // M10 hardening: wait for CarsContext/BookingsContext to finish hydrating
  // from Supabase before deciding which dashboard view to show. Without
  // this, an owner who already has listings could see `myCars.length === 0`
  // for one frame (before CarsContext loads) and briefly flash the "list
  // your first car" onboarding view instead of their real dashboard --
  // mirrors the same isLoaded/isLoading gate HomeScreen and MyRentsScreen
  // already use for the identical reason.
  if (!carsLoaded || bookingsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <OwnerDashboardSkeleton topInset={insets.top} />
      </View>
    );
  }

  // A brand-new owner account (verified but hasn't listed a single car yet)
  // gets a dedicated onboarding view instead of the full tabbed dashboard —
  // showing a hero card full of zeros next to empty Bookings/Earnings tabs
  // reads as broken, not "get started". This never overrides an owner who
  // already has at least one listing, even if their bookings/earnings are
  // themselves currently zero.
  if (myCars.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.sm }}>
          <Text style={typography.displayMd}>My Listings</Text>
          <Text style={styles.subtitle}>Manage the cars you rent out</Text>
        </View>
        <View style={styles.onboardingWrap}>
          <View style={styles.onboardingIconCircle}>
            <Ionicons name="car-sport-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.onboardingTitle}>List your first car</Text>
          <Text style={styles.onboardingSubtitle}>
            You're set up as a rental owner, but you haven't listed a car yet. Add your first listing to start
            receiving booking requests from renters.
          </Text>
          <PrimaryButton
            label="List Your Car"
            onPress={() => navigation.navigate('OwnerAddCar')}
            icon={<Ionicons name="add-circle-outline" size={19} color={colors.onPrimary} />}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.sm }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={typography.displayMd}>My Listings</Text>
            <Text style={styles.subtitle}>Manage the cars you rent out</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => navigation.navigate('OwnerAddCar')} accessibilityLabel="Add a car">
            <Ionicons name="add" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>

        {allCarsInactive ? (
          <View style={styles.unavailableBanner}>
            <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
            <Text style={styles.unavailableBannerText}>
              Currently unavailable — all your cars are hidden, so renters can't find or book them. Turn one Active
              to start receiving requests again.
            </Text>
          </View>
        ) : null}

        <LinearGradient
          colors={[colors.onPrimary, '#2A2A3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, shadows.md]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="wallet-outline" size={14} color={colors.primary} />
              <Text style={styles.heroBadgeText}>Total Earnings</Text>
            </View>
            <Ionicons name="trending-up" size={18} color={colors.primary} />
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(totalEarnings)}</Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{myCars.length}</Text>
              <Text style={styles.heroStatLabel}>Listings</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{activeBookings}</Text>
              <Text style={styles.heroStatLabel}>Active</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1}>{formatCurrency(thisMonthEarnings)}</Text>
              <Text style={styles.heroStatLabel}>This Month</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, tab === 'listings' ? styles.tabActive : undefined]} onPress={() => setTab('listings')}>
            <Text style={[styles.tabText, tab === 'listings' ? styles.tabTextActive : undefined]}>
              Listings ({myCars.length})
            </Text>
          </Pressable>
          <Pressable style={[styles.tab, styles.tabInnerRow, tab === 'requests' ? styles.tabActive : undefined]} onPress={() => setTab('requests')}>
            <Text style={[styles.tabText, tab === 'requests' ? styles.tabTextActive : undefined]}>
              Bookings ({requests.length})
            </Text>
            {pendingRequestsCount > 0 ? (
              <View style={styles.tabDot}>
                <Text style={styles.tabDotText}>{pendingRequestsCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={[styles.tab, tab === 'earnings' ? styles.tabActive : undefined]} onPress={() => setTab('earnings')}>
            <Text style={[styles.tabText, tab === 'earnings' ? styles.tabTextActive : undefined]}>
              Earnings
            </Text>
          </Pressable>
        </View>
      </View>

      {tab === 'listings' ? (
        <FlatList
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: tabBarClearance }}
          data={myCars}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListingCard
              car={item}
              bookedNow={getBookedNowCount(item.id)}
              onEdit={() => navigation.navigate('OwnerAddCar', { carId: item.id })}
              onRemove={() => onRemoveCar(item)}
              onToggleActive={(next) => onToggleCarActive(item, next)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="car-sport-outline"
              title="No cars listed yet"
              subtitle="Add your first car to start renting it out to travelers."
            />
          }
        />
      ) : tab === 'requests' ? (
        <FlatList
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: tabBarClearance }}
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const car = myCars.find((c) => c.id === item.carId);
            const customer = getUserById(item.renterId);
            return (
              <BookingRequestCard
                booking={item}
                car={car}
                customer={customer}
                onPress={() => navigation.navigate('BookingDetails', { bookingId: item.id })}
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="calendar-outline" title="No booking requests yet" subtitle="Bookings on your cars will show up here." />
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: tabBarClearance }}
          data={completedBookings}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.earningsSummaryRow}>
              <View style={[styles.earningsSummaryCard, shadows.sm]}>
                <Ionicons name="cash-outline" size={20} color={colors.success} />
                <Text style={styles.earningsSummaryValue}>{formatCurrency(totalEarnings)}</Text>
                <Text style={styles.earningsSummaryLabel}>Total Earned</Text>
              </View>
              <View style={[styles.earningsSummaryCard, shadows.sm]}>
                <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
                <Text style={styles.earningsSummaryValue}>{formatCurrency(pendingPayout)}</Text>
                <Text style={styles.earningsSummaryLabel}>Pending Payout</Text>
              </View>
            </View>
          }
          ListHeaderComponentStyle={{ marginBottom: spacing.md }}
          ListFooterComponent={
            completedBookings.length > 0 ? (
              <View style={styles.insightsSection}>
                <Text style={styles.insightsSectionTitle}>Insights</Text>
                <View style={styles.insightsRow}>
                  <View style={[styles.insightCard, shadows.sm]}>
                    <Text style={styles.insightValue}>{completedBookings.length}</Text>
                    <Text style={styles.insightLabel}>Completed Rentals</Text>
                  </View>
                  <View style={[styles.insightCard, shadows.sm]}>
                    <Text style={styles.insightValue} numberOfLines={1}>{formatCurrency(avgBookingValue)}</Text>
                    <Text style={styles.insightLabel}>Avg. per Rental</Text>
                  </View>
                  <View style={[styles.insightCard, shadows.sm, { marginRight: 0 }]}>
                    <Text style={styles.insightValue}>{occupancyPercent}%</Text>
                    <Text style={styles.insightLabel}>Fleet Occupancy Now</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const car = myCars.find((c) => c.id === item.carId);
            return (
              <View style={[styles.payoutRow, shadows.sm]}>
                <View style={styles.payoutIcon}>
                  <Ionicons name="checkmark-done" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={typography.titleMd} numberOfLines={1}>{car?.name ?? 'Vehicle'}</Text>
                  <Text style={styles.payoutMeta}>
                    {formatShortDate(item.dropoffDate)} · {item.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'}
                  </Text>
                </View>
                <Text style={styles.payoutAmount}>+{formatCurrency(item.total)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="cash-outline"
              title="No payouts yet"
              subtitle="Completed bookings will appear here as payout history."
            />
          }
        />
      )}
    </View>
  );
};

const ListingCard: React.FC<{
  car: Car;
  bookedNow: number;
  onEdit: () => void;
  onRemove: () => void;
  onToggleActive: (next: boolean) => void;
}> = ({ car, bookedNow, onEdit, onRemove, onToggleActive }) => {
  // undefined/true both read as "Active" — see the Car.isActive comment in
  // types/index.ts for why missing means visible, not hidden.
  const isActive = car.isActive !== false;
  const totalQuantity = getCarQuantity(car);
  const availableNow = Math.max(totalQuantity - bookedNow, 0);
  return (
    <View style={[styles.carRow, shadows.sm]}>
      <View style={styles.carRowTop}>
        <View>
          <FallbackImage uri={car.images[0]} style={styles.carImage} />
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={styles.ratingPillText}>{car.rating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>{String(car.category).toUpperCase()}</Text>
          </View>
          <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
          <Rating value={car.rating} reviewCount={car.reviewCount} compact />
          <Text style={styles.price}>{formatCurrency(car.pricePerDay)} / day</Text>
        </View>
        <View style={styles.carRowActions}>
          <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="Edit listing" style={{ marginBottom: spacing.md }}>
            <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove listing">
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </View>
      </View>
      <View style={styles.inventoryRow}>
        <View style={styles.inventoryStat}>
          <Text style={styles.inventoryValue}>{totalQuantity}</Text>
          <Text style={styles.inventoryLabel}>Total</Text>
        </View>
        <View style={styles.inventoryDivider} />
        <View style={styles.inventoryStat}>
          <Text style={styles.inventoryValue}>{bookedNow}</Text>
          <Text style={styles.inventoryLabel}>Booked</Text>
        </View>
        <View style={styles.inventoryDivider} />
        <View style={styles.inventoryStat}>
          <Text style={[styles.inventoryValue, { color: availableNow > 0 ? colors.success : colors.danger }]}>
            {availableNow}
          </Text>
          <Text style={styles.inventoryLabel}>Available</Text>
        </View>
      </View>
      <View style={styles.activeRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.activePillRow}>
            <View style={[styles.activeDot, { backgroundColor: isActive ? colors.success : colors.textTertiary }]} />
            <Text style={styles.activeLabel}>{isActive ? 'Active' : 'Inactive'}</Text>
          </View>
          <Text style={styles.activeCaption}>{isActive ? 'Visible to users' : 'Hidden from users'}</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={onToggleActive}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.white}
        />
      </View>
    </View>
  );
};

const BookingRequestCard: React.FC<{
  booking: Booking;
  car?: Car;
  customer?: AppUser;
  onPress: () => void;
}> = ({ booking, car, customer, onPress }) => {
  const meta = STATUS_META[booking.status];
  return (
    <Pressable
      style={({ pressed }) => [styles.requestCard, shadows.sm, pressed ? styles.requestCardPressed : undefined]}
      onPress={onPress}
    >
      <View style={styles.requestTopRow}>
        <FallbackImage uri={car?.images[0]} style={styles.requestCarImage} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={typography.titleLg} numberOfLines={1}>{car?.name ?? 'Vehicle'}</Text>
          <Text style={styles.requestId} numberOfLines={1}>{booking.id}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={13} color={meta.color} />
          <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.customerRow}>
        {/* booking.renterName/renterAvatar (set at booking creation -- see
            BookingsContext.createBooking) take priority over the `customer`
            lookup: under real Supabase Auth's RLS, getUserById() for anyone
            but the signed-in user always resolves to undefined, so for an
            owner looking at a customer's booking, the snapshot on the
            booking itself is the only reliable source. */}
        <FallbackImage uri={booking.renterAvatar ?? customer?.avatar} style={styles.customerAvatar} iconSize={16} />
        <Text style={styles.customerName} numberOfLines={1}>{booking.renterName ?? customer?.name ?? 'Customer'}</Text>
      </View>

      <Text style={styles.requestDates}>
        {formatShortDate(booking.pickupDate)} - {formatShortDate(booking.dropoffDate)} · {booking.days} day{booking.days === 1 ? '' : 's'}
      </Text>
      <View style={styles.requestBottomRow}>
        <Text style={styles.requestMeta}>{booking.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'}</Text>
        <Text style={styles.requestAmount}>{formatCurrency(booking.total)}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  onboardingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  onboardingIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  onboardingTitle: { ...typography.headingLg, color: colors.textPrimary, textAlign: 'center' },
  onboardingSubtitle: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, marginTop: 4 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244,199,40,0.14)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: { ...typography.caption, color: colors.primary, marginLeft: 6, fontWeight: '600' as const },
  heroAmount: { ...typography.displayLg, color: colors.white, marginTop: spacing.sm },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  heroStat: { flex: 1 },
  heroStatValue: { ...typography.titleLg, color: colors.white },
  heroStatLabel: { ...typography.caption, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: spacing.sm },
  tabRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill, padding: 4, marginTop: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.onPrimary },
  tabText: { ...typography.titleMd, color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  carRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.md },
  carRowActions: { alignItems: 'center', justifyContent: 'center' },
  carImage: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surface },
  ratingPill: {
    position: 'absolute',
    bottom: -6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.onPrimary,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingPillText: { ...typography.caption, color: colors.white, marginLeft: 3, fontSize: 10 },
  categoryTag: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  categoryTagText: { ...typography.caption, color: colors.textSecondary, fontSize: 10, letterSpacing: 0.5 },
  price: { ...typography.titleMd, color: colors.textPrimary, marginTop: 4 },
  requestCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  // Same cheap opacity-dip press feedback as CarCard/RentalCard -- no
  // Animated API, just Pressable's own per-press style function.
  requestCardPressed: { opacity: 0.92 },
  requestTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { ...typography.caption, marginLeft: 4, fontWeight: '600' as const },
  requestDates: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6 },
  requestMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  earningsSummaryRow: { flexDirection: 'row' },
  earningsSummaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginRight: spacing.sm, alignItems: 'flex-start' },
  earningsSummaryValue: { ...typography.titleLg, color: colors.textPrimary, marginTop: 6 },
  earningsSummaryLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
  payoutIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
  payoutMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  payoutAmount: { ...typography.titleMd, color: colors.success },
  insightsSection: { marginTop: spacing.lg },
  insightsSectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  insightsRow: { flexDirection: 'row' },
  insightCard: { flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginRight: spacing.sm, alignItems: 'flex-start' },
  insightValue: { ...typography.titleLg, color: colors.textPrimary },
  insightLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  unavailableBannerText: { ...typography.bodySm, color: colors.warning, marginLeft: 8, flex: 1, lineHeight: 18 },
  tabInnerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tabDot: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDotText: { ...typography.caption, color: colors.white, fontSize: 10, fontWeight: '700' as const },
  carRowTop: { flexDirection: 'row', alignItems: 'center' },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  inventoryStat: { flex: 1, alignItems: 'center' },
  inventoryDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  inventoryValue: { ...typography.titleLg, color: colors.textPrimary },
  inventoryLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  activePillRow: { flexDirection: 'row', alignItems: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  activeLabel: { ...typography.titleMd, color: colors.textPrimary },
  activeCaption: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  requestCarImage: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.surface },
  requestId: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, marginRight: 6 },
  customerName: { ...typography.bodySm, color: colors.textSecondary, flex: 1 },
  requestBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  requestAmount: { ...typography.titleMd, color: colors.textPrimary },
});
