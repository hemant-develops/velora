import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FallbackImage } from '../../components/FallbackImage';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { useReviews } from '../../context/ReviewsContext';
import { brands } from '../../data/brands';
import { formatCurrency, formatDate, formatShortDate } from '../../utils/format';
import { BookingStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetails'>;

const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; note: string }> = {
  pending: { label: 'Pending', color: colors.warning, bg: colors.warningBg, icon: 'time-outline', note: 'Waiting for the owner to confirm this request.' },
  upcoming: { label: 'Confirmed', color: colors.info, bg: colors.infoBg, icon: 'checkmark-circle-outline', note: 'This booking is confirmed and upcoming.' },
  active: { label: 'Active', color: colors.success, bg: colors.successBg, icon: 'car-sport-outline', note: 'This rental is currently in progress.' },
  completed: { label: 'Completed', color: colors.textSecondary, bg: colors.surface, icon: 'checkmark-circle-outline', note: 'This rental has been completed.' },
  cancelled: { label: 'Cancelled', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle-outline', note: 'This booking was cancelled.' },
  rejected: { label: 'Declined', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle-outline', note: 'This booking request was declined.' },
};

export const BookingDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user, getUserById } = useAuth();
  const { getCarById } = useCars();
  const { getBookingById, confirmBooking, rejectBooking, cancelBooking, updateStatus } = useBookings();
  const { hasReviewedBooking, getReviewForBooking } = useReviews();

  const booking = getBookingById(route.params.bookingId);
  const car = booking ? getCarById(booking.carId) : undefined;

  if (!user || !booking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Booking not found" />
      </View>
    );
  }

  // Perspective is derived from who actually owns the car / made the
  // booking, not just the account's current role toggle — a real owner
  // always sees the Customer-facing layout for their own bookings, and a
  // real renter always sees the Owner-facing layout for theirs.
  const isOwnerView = !!car && car.ownerId === user.id;
  const customer = getUserById(booking.renterId);
  const owner = car ? getUserById(car.ownerId) : undefined;
  const brandName = car ? brands.find((b) => b.id === car.brandId)?.name : undefined;
  const meta = STATUS_META[booking.status];
  const alreadyReviewed = hasReviewedBooking(booking.id);
  const existingReview = getReviewForBooking(booking.id);

  const onViewCustomerProfile = () => {
    navigation.navigate('CustomerProfile', { userId: booking.renterId, carId: booking.carId, carName: car?.name });
  };

  const onViewOwnerProfile = () => {
    if (!car) return;
    navigation.navigate('OwnerProfile', { ownerId: car.ownerId, carId: car.id, carName: car.name });
  };

  const onMessageCustomer = () => {
    if (!car) return;
    navigation.navigate('ConversationDetail', {
      carId: car.id,
      carName: car.name,
      renterId: booking.renterId,
      renterName: customer?.name ?? 'Customer',
      renterAvatar: customer?.avatar,
      ownerId: user.id,
      ownerName: user.name,
      ownerAvatar: user.avatar,
    });
  };

  const onMessageOwner = () => {
    if (!car || !owner) return;
    navigation.navigate('ConversationDetail', {
      carId: car.id,
      carName: car.name,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerAvatar: owner.avatar,
    });
  };

  const onConfirm = () => {
    Alert.alert('Confirm Booking', `Confirm this booking for ${customer?.name ?? 'this customer'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => confirmBooking(booking.id) },
    ]);
  };

  const onReject = () => {
    Alert.alert('Reject Booking', 'This will decline the request and notify the customer. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectBooking(booking.id) },
    ]);
  };

  const onCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: () => cancelBooking(booking.id, isOwnerView ? 'owner' : 'renter'),
      },
    ]);
  };

  const onMarkActive = () => {
    Alert.alert('Mark as Active', 'Mark this rental as active now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Active', onPress: () => updateStatus(booking.id, 'active') },
    ]);
  };

  const onMarkCompleted = () => {
    Alert.alert('Mark as Completed', 'Mark this rental as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Completed', onPress: () => updateStatus(booking.id, 'completed') },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Booking Details" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <View style={[styles.statusBanner, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
            <Text style={styles.statusNote}>{meta.note}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Trip</Text>
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.carRow}>
            <FallbackImage uri={car?.images[0]} style={styles.carImage} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={typography.titleLg} numberOfLines={1}>{car?.name ?? 'Vehicle'}</Text>
              <Text style={styles.carMeta} numberOfLines={1}>
                {[brandName, car?.category].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <DetailRow label="Booking ID" value={booking.id} />
          <DetailRow label="Booked On" value={formatDate(booking.createdAt)} />
          <DetailRow label="Rental Type" value={booking.rentalMode === 'self_drive' ? 'Self Drive' : 'With Driver'} />
          <DetailRow label="Pickup" value={`${formatShortDate(booking.pickupDate)} · ${booking.pickupTime}`} />
          <DetailRow label="Return" value={`${formatShortDate(booking.dropoffDate)} · ${booking.dropoffTime}`} />
          <DetailRow label="Duration" value={`${booking.days} day${booking.days === 1 ? '' : 's'}`} />
          <DetailRow label="Pickup Location" value={booking.pickupLocation || car?.location || 'Not specified'} />
          <View style={styles.divider} />
          <DetailRow label="Total Amount" value={formatCurrency(booking.total)} bold />
        </View>

        {isOwnerView ? (
          <>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={[styles.card, shadows.sm]}>
              <View style={styles.personRow}>
                <FallbackImage uri={customer?.avatar} style={styles.avatar} iconSize={20} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={typography.titleLg} numberOfLines={1}>{customer?.name ?? 'Customer'}</Text>
                  {customer?.location ? <Text style={styles.carMeta}>{customer.location}</Text> : null}
                </View>
              </View>
              <View style={styles.divider} />
              <DetailRow label="Email" value={customer?.email || 'Not provided'} />
              <DetailRow label="Phone" value={customer?.phone || 'Not provided'} />
              {customer?.createdAt ? <DetailRow label="Member Since" value={formatDate(customer.createdAt)} /> : null}
              {customer?.bio?.trim() ? <DetailRow label="Bio" value={customer.bio.trim()} /> : null}
              <PrimaryButton label="View Customer Profile" onPress={onViewCustomerProfile} variant="outline" size="sm" style={{ marginTop: spacing.sm }} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Owner</Text>
            <View style={[styles.card, shadows.sm]}>
              <View style={styles.personRow}>
                <FallbackImage uri={owner?.avatar} style={styles.avatar} iconSize={20} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={typography.titleLg} numberOfLines={1}>{owner?.name ?? 'Owner'}</Text>
                  {owner?.location ? <Text style={styles.carMeta}>{owner.location}</Text> : null}
                </View>
              </View>
              <PrimaryButton label="View Owner Profile" onPress={onViewOwnerProfile} variant="outline" size="sm" style={{ marginTop: spacing.md }} />
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={[styles.card, shadows.sm]}>
          {isOwnerView ? (
            <>
              {booking.status === 'pending' ? (
                <>
                  <PrimaryButton label="Confirm Booking" onPress={onConfirm} style={{ marginBottom: spacing.sm }} />
                  <PrimaryButton label="Reject Booking" onPress={onReject} variant="danger" style={{ marginBottom: spacing.sm }} />
                </>
              ) : null}
              {booking.status === 'upcoming' ? (
                <PrimaryButton label="Mark as Active" onPress={onMarkActive} variant="dark" style={{ marginBottom: spacing.sm }} />
              ) : null}
              {booking.status === 'active' ? (
                <PrimaryButton label="Mark as Completed" onPress={onMarkCompleted} variant="dark" style={{ marginBottom: spacing.sm }} />
              ) : null}
              <PrimaryButton
                label="Message Customer"
                onPress={onMessageCustomer}
                variant="outline"
                icon={<Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textPrimary} />}
              />
            </>
          ) : (
            <>
              <PrimaryButton
                label="Message Owner"
                onPress={onMessageOwner}
                variant="outline"
                icon={<Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textPrimary} />}
                style={{ marginBottom: spacing.sm }}
              />
              {(booking.status === 'pending' || booking.status === 'upcoming') ? (
                <PrimaryButton label="Cancel Booking" onPress={onCancel} variant="danger" style={{ marginBottom: spacing.sm }} />
              ) : null}
              {booking.status === 'completed' ? (
                alreadyReviewed ? (
                  <View style={styles.reviewedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.reviewedText}>
                      You rated this {existingReview?.rating ?? ''}/5{existingReview?.comment ? ' · review submitted' : ''}
                    </Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label="Rate & Review"
                    onPress={() => navigation.navigate('Review', { bookingId: booking.id, carId: booking.carId })}
                    variant="dark"
                  />
                )
              ) : null}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const DetailRow: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, bold ? { ...typography.headingSm } : undefined]} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg },
  statusBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  statusLabel: { ...typography.titleLg, fontWeight: '700' },
  statusNote: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md },
  carRow: { flexDirection: 'row', alignItems: 'center' },
  carImage: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  detailLabel: { ...typography.bodyMd, color: colors.textSecondary, marginRight: spacing.sm },
  detailValue: { ...typography.titleMd, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  reviewedRow: { flexDirection: 'row', alignItems: 'center' },
  reviewedText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 6 },
});
