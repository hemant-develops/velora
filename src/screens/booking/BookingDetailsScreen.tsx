import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FallbackImage } from '../../components/FallbackImage';
import { BookingDetailsSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';
import { useBookings } from '../../context/BookingsContext';
import { useReviews } from '../../context/ReviewsContext';
import { formatCurrency, formatDate, formatShortDate } from '../../utils/format';
import { BookingStatus, PaymentStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetails'>;

// M10 -- paymentStatus is optional (bookings made before it existed), and a
// missing value reads as 'unpaid' everywhere, matching how PaymentScreen/
// BookingConfirmation already treat it.
const PAYMENT_META: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  unpaid: { label: 'Due at Pickup', color: colors.warning, bg: colors.warningBg },
  processing: { label: 'Processing', color: colors.info, bg: colors.infoBg },
  paid: { label: 'Paid', color: colors.success, bg: colors.successBg },
  failed: { label: 'Payment Failed', color: colors.danger, bg: colors.dangerBg },
};

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
  const { brands } = useCatalog();
  const { getBookingById, confirmBooking, rejectBooking, cancelBooking, updateStatus, isLoading: bookingsLoading } = useBookings();
  const { hasReviewedBooking, getReviewForBooking } = useReviews();

  // BookingsContext reads its store from Supabase asynchronously -- on a
  // cold start (e.g. a push notification/deep link landing directly here)
  // this previously showed "Booking not found" for a split second before the
  // real data had loaded, exactly the same class of flash HomeScreen/
  // CarDetailsScreen already guarded against with their own `isLoaded`
  // checks. The genuine not-found/no-access behavior below is unchanged
  // once loading has actually finished.
  if (bookingsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Booking Details" onBack={() => navigation.goBack()} />
        <BookingDetailsSkeleton />
      </View>
    );
  }

  const rawBooking = getBookingById(route.params.bookingId);
  // Final-verification fix -- getBookingById(id) has no participant check of
  // its own. Every real entry point (My Rentals, Booking Requests) only ever
  // links here with the current user's own booking ids, but nothing
  // previously stopped a foreign/guessed bookingId from rendering someone
  // else's full booking (dates, price, the other party's name) here. Treat a
  // booking that isn't this user's as not found, same as a missing one.
  const booking =
    rawBooking && user && (rawBooking.renterId === user.id || getCarById(rawBooking.carId)?.ownerId === user.id)
      ? rawBooking
      : undefined;
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
  // getUserById(booking.renterId) can only ever resolve for the CURRENT
  // signed-in user under real Supabase Auth's RLS (profiles_select_own:
  // id = auth.uid() only) -- for an owner looking up their customer, it will
  // always come back undefined. booking.renterName/renterAvatar (a snapshot
  // taken when the renter created the booking -- see
  // BookingsContext.createBooking) is what actually stays available here,
  // so it takes priority; the getUserById() lookup is kept only as a
  // fallback for bookings created before that snapshot existed.
  const customer = getUserById(booking.renterId);
  const customerName = booking.renterName ?? customer?.name ?? 'Customer';
  const customerAvatar = booking.renterAvatar ?? customer?.avatar;
  const owner = car ? getUserById(car.ownerId) : undefined;
  const brandName = car ? brands.find((b) => b.id === car.brandId)?.name : undefined;
  const meta = STATUS_META[booking.status];
  const paymentStatus: PaymentStatus = booking.paymentStatus ?? 'unpaid';
  const paymentMeta = PAYMENT_META[paymentStatus];
  // M10 -- payment state and cancellation state are deliberately separate
  // (see BookingsContext.cancelBooking's own comment): cancelling never
  // auto-refunds here, since there's no real gateway configured to reverse
  // a charge through. Surface that plainly instead of pretending nothing
  // needs following up.
  const showRefundNote = booking.status === 'cancelled' && paymentStatus === 'paid';
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
      renterName: customerName,
      renterAvatar: customerAvatar,
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

  // Owner<->Customer relationship, dispute step -- a clear "something wrong
  // with this booking?" entry point on both sides, right on the trip that's
  // actually affected, routing into the same real Report flow already used
  // from a listing/profile/conversation (see ReportsContext/ReportScreen).
  // Reports a 'user' target (the counterpart on THIS booking) rather than a
  // new 'booking' targetKind, since the underlying local reports table has
  // no booking-shaped record to attach to and adding one is out of scope for
  // a UI-only pass -- the booking id is still included in the label so
  // whoever reviews reports knows exactly which trip it's about.
  const onReportIssue = () => {
    if (isOwnerView) {
      navigation.navigate('Report', {
        targetKind: 'user',
        targetId: booking.renterId,
        targetLabel: `${customerName} — Booking ${booking.id}`,
      });
    } else if (owner) {
      navigation.navigate('Report', {
        targetKind: 'user',
        targetId: owner.id,
        targetLabel: `${owner.name} — Booking ${booking.id}`,
      });
    }
  };

  // Every action below awaits its BookingsContext call and surfaces
  // `result.error` via Alert when the transition was refused (see
  // canTransition/VALID_TRANSITIONS in BookingsContext) -- same
  // success/error-surfacing convention already used elsewhere in the app
  // (e.g. ProfileScreen.onToggleRole), so a stale screen or a
  // no-longer-valid action always gets a clear reason instead of silently
  // doing nothing.
  const onConfirm = () => {
    Alert.alert('Confirm Booking', `Confirm this booking for ${customerName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          const result = await confirmBooking(booking.id);
          if (!result.success && result.error) Alert.alert('Unable to Confirm', result.error);
        },
      },
    ]);
  };

  const onReject = () => {
    Alert.alert('Reject Booking', 'This will decline the request and notify the customer. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          const result = await rejectBooking(booking.id);
          if (!result.success && result.error) Alert.alert('Unable to Reject', result.error);
        },
      },
    ]);
  };

  const onCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: async () => {
          const result = await cancelBooking(booking.id, isOwnerView ? 'owner' : 'renter');
          if (!result.success && result.error) Alert.alert('Unable to Cancel', result.error);
        },
      },
    ]);
  };

  const onMarkActive = () => {
    Alert.alert('Mark as Active', 'Mark this rental as active now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Active',
        onPress: async () => {
          const result = await updateStatus(booking.id, 'active');
          if (!result.success && result.error) Alert.alert('Unable to Update', result.error);
        },
      },
    ]);
  };

  const onMarkCompleted = () => {
    Alert.alert('Mark as Completed', 'Mark this rental as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Completed',
        onPress: async () => {
          const result = await updateStatus(booking.id, 'completed');
          if (!result.success && result.error) Alert.alert('Unable to Update', result.error);
        },
      },
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
          <View style={styles.paymentRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <View style={[styles.paymentBadge, { backgroundColor: paymentMeta.bg }]}>
              <Text style={[styles.paymentBadgeText, { color: paymentMeta.color }]}>{paymentMeta.label}</Text>
            </View>
          </View>
          {showRefundNote ? (
            <View style={styles.refundNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.refundNoteText}>
                This booking was paid before it was cancelled. VELORA has no payment gateway connected yet, so refunds
                for cancelled bookings are handled outside the app for now — message the {isOwnerView ? 'customer' : 'owner'} to arrange one.
              </Text>
            </View>
          ) : null}
        </View>

        {isOwnerView ? (
          <>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={[styles.card, shadows.sm]}>
              <View style={styles.personRow}>
                <FallbackImage uri={customerAvatar} style={styles.avatar} iconSize={20} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={typography.titleLg} numberOfLines={1}>{customerName}</Text>
                  {customer?.location ? <Text style={styles.carMeta}>{customer.location}</Text> : null}
                </View>
              </View>
              <View style={styles.divider} />
              {/* Email/phone/bio/member-since are only ever available here
                  when getUserById() actually resolved -- i.e. never, for any
                  renter but the current signed-in user, under real Supabase
                  Auth's RLS. They correctly fall back to "Not provided" /
                  are omitted rather than showing stale or fabricated data. */}
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
          {(isOwnerView || owner) ? (
            <Pressable style={styles.reportRow} onPress={onReportIssue} hitSlop={6}>
              <Ionicons name="flag-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.reportRowText}>Report an issue with this trip</Text>
            </Pressable>
          ) : null}
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
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  paymentBadge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  paymentBadgeText: { ...typography.caption, fontWeight: '700' as const },
  refundNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm },
  refundNoteText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 6, flex: 1, lineHeight: 18 },
  reportRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, paddingVertical: spacing.xs },
  reportRowText: { ...typography.bodySm, color: colors.textTertiary, marginLeft: 6 },
});
