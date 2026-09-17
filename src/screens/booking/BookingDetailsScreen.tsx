import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
import { useNotifications } from '../../context/NotificationsContext';
import { formatCurrency, formatDate, formatShortDate } from '../../utils/format';
import { formatResponseCountdown, isResponseOverdue } from '../../utils/bookingCountdown';
import {
  BookingConditionPhoto,
  ConditionPhotoStage,
  deleteConditionPhoto,
  fetchConditionPhotos,
  uploadConditionPhoto,
} from '../../utils/bookingConditionPhotos';
import {
  ExtensionRequest,
  ExtensionRequestType,
  addDaysIso,
  cancelExtensionRequest,
  createExtensionRequest,
  fetchExtensionRequests,
  respondToExtensionRequest,
} from '../../utils/tripExtensions';
import { toLocalDateOnly } from '../../utils/dateRange';
import { BookingStatus, PaymentStatus } from '../../types';

// PHASE 7 -- Condition Photos are only meaningful once a booking is real
// (not still a pending request that might get rejected, and not a
// cancelled/declined one) -- shown from the moment it's confirmed all the
// way through completion, so a pickup-day photo taken on an 'upcoming'
// booking is never blocked on someone first tapping "Mark as Active".
const CONDITION_PHOTOS_VISIBLE_STATUSES: BookingStatus[] = ['upcoming', 'active', 'completed'];

// PHASE 7 -- Trip Extension / Early Return. Narrower than the condition-
// photos gate above -- 'completed' is excluded because there's no return
// date left to move once the trip is already over, and 'pending' is
// excluded because that request itself might still be rejected.
const TRIP_CHANGE_VISIBLE_STATUSES: BookingStatus[] = ['upcoming', 'active'];

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
  // PHASE 6 -- Countdown. Ticks once a minute so a pending booking's "Xh Ym
  // left to respond" stays live while this screen is open, instead of
  // freezing at whatever it read on first render. Declared unconditionally,
  // above every early return below, per the Rules of Hooks -- it's cheap
  // enough to run even on a screen state that ends up not using it.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // PHASE 7 -- Condition Photos. Fetched by route.params.bookingId (a plain
  // prop, always available) rather than the derived `booking` object below,
  // so this hook can stay above every early return per the Rules of Hooks --
  // same reasoning as nowTick just above. Harmless to fetch even while
  // bookingsLoading or for an id that turns out not-found/not-this-user's:
  // fetchConditionPhotos fails open (empty list) on any error, and the
  // section that renders `photos` is itself gated behind the same
  // ownership/not-found check as the rest of this screen.
  const [photos, setPhotos] = useState<BookingConditionPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [uploadingStage, setUploadingStage] = useState<ConditionPhotoStage | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPhotosLoading(true);
    fetchConditionPhotos(route.params.bookingId).then((result) => {
      if (!cancelled) {
        setPhotos(result);
        setPhotosLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.bookingId]);

  // PHASE 7 -- Trip Extension / Early Return requests. Same
  // above-every-early-return placement and same fail-open fetch reasoning as
  // the Condition Photos state just above.
  const [extensionRequests, setExtensionRequests] = useState<ExtensionRequest[]>([]);
  const [extensionLoading, setExtensionLoading] = useState(true);
  const [draftDropoffDate, setDraftDropoffDate] = useState<string | null>(null);
  const [extensionBusy, setExtensionBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setExtensionLoading(true);
    fetchExtensionRequests(route.params.bookingId).then((result) => {
      if (!cancelled) {
        setExtensionRequests(result);
        setExtensionLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.bookingId]);

  const { user, getUserById } = useAuth();
  const { getCarById } = useCars();
  const { brands } = useCatalog();
  const {
    getBookingById,
    confirmBooking,
    rejectBooking,
    cancelBooking,
    updateStatus,
    refreshBookings,
    isLoading: bookingsLoading,
  } = useBookings();
  const { hasReviewedBooking, getReviewForBooking } = useReviews();
  const { notify } = useNotifications();

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

  // PHASE 7 -- Trip Extension / Early Return. booking.pickupDate/dropoffDate
  // are full ISO timestamps (BookingScreen writes them via
  // `pickupDateTime.toISOString()`), but the stepper below and the
  // `date`-typed columns in migration 0010 both work in plain calendar
  // days. Normalizing once here (via the same toLocalDateOnly dateRange.ts
  // already uses for its own day-granularity comparisons) avoids comparing
  // a full ISO string against a short 'YYYY-MM-DD' one further down, which
  // would be wrong for same-day comparisons (a short date string is always
  // a "lesser" string than a same-day ISO string with a time component).
  const normalizedDropoffDate = toLocalDateOnly(booking.dropoffDate);
  const normalizedPickupDate = toLocalDateOnly(booking.pickupDate);

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
  //
  // REFUND VISIBILITY FIX -- this only ever checked 'cancelled', but an
  // owner rejecting a booking (rejectBooking -> status 'rejected', a
  // DIFFERENT status from 'cancelled' -- see BookingsContext) leaves a
  // renter's payment sitting at 'paid' with the exact same refund-owed
  // situation and NO note shown at all -- a real gap, not a display
  // preference, since 'rejected' only happens before a booking is
  // confirmed and is therefore the most common paid-then-undone case.
  const showRefundNote = (booking.status === 'cancelled' || booking.status === 'rejected') && paymentStatus === 'paid';
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

  // PHASE 7 -- Condition Photos. Open to BOTH sides (renter and owner) --
  // either party may want to document the car's state at pickup or return,
  // and migration 0009's RLS scopes writes/reads to just this booking's two
  // participants either way. Mirrors OwnerAddCarScreen's own gallery-pick
  // pattern (permission check -> launchImageLibraryAsync) rather than
  // reinventing it, minus that screen's multi-select/pre-fetch machinery --
  // condition photos are added one at a time, right after being taken/picked,
  // so there's no long form delay for a picker grant to go stale during (see
  // uploadImage.ts's Phase 1 comment for why that mattered for car photos).
  const onAddConditionPhoto = async (stage: ConditionPhotoStage) => {
    if (uploadingStage) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a condition photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setUploadingStage(stage);
    try {
      const photo = await uploadConditionPhoto(booking.id, stage, { uri: result.assets[0].uri }, user.id);
      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert("Couldn't Add Photo", message);
    } finally {
      setUploadingStage(null);
    }
  };

  const onRemoveConditionPhoto = (photo: BookingConditionPhoto) => {
    Alert.alert('Remove Photo', 'Remove this condition photo? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteConditionPhoto(photo.id);
          if (result.success) {
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
          } else if (result.error) {
            Alert.alert("Couldn't Remove Photo", result.error);
          }
        },
      },
    ]);
  };

  // PHASE 7 -- Trip Extension / Early Return. Only the renter drafts/sends a
  // request (the stepper UI below is only ever rendered for them); the
  // draft lives as a plain date string, defaulting to the booking's actual
  // dropoffDate until the renter taps +/- at least once.
  const pendingExtensionRequest = extensionRequests.find((r) => r.status === 'pending');
  const effectiveDraftDropoff = draftDropoffDate ?? normalizedDropoffDate;

  const onAdjustDraftDropoff = (deltaDays: number) => {
    const next = addDaysIso(effectiveDraftDropoff, deltaDays);
    // A return date can never precede the trip's own pickup date.
    if (next < normalizedPickupDate) return;
    setDraftDropoffDate(next);
  };

  const onSendExtensionRequest = () => {
    if (effectiveDraftDropoff === normalizedDropoffDate) return;
    const requestType: ExtensionRequestType = effectiveDraftDropoff > normalizedDropoffDate ? 'extend' : 'early_return';
    const actionLabel = requestType === 'extend' ? 'extend this trip' : 'end this trip early';
    Alert.alert(
      'Send Request',
      `Ask the owner to ${actionLabel}, moving the return date to ${formatShortDate(effectiveDraftDropoff)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: async () => {
            setExtensionBusy(true);
            const result = await createExtensionRequest({
              bookingId: booking.id,
              requestedBy: user.id,
              requestType,
              currentDropoffDate: normalizedDropoffDate,
              requestedDropoffDate: effectiveDraftDropoff,
            });
            setExtensionBusy(false);
            if (result.success && result.request) {
              setExtensionRequests((prev) => [result.request as ExtensionRequest, ...prev]);
              setDraftDropoffDate(null);
              // BUG FIX -- trip-extension requests never notified anyone;
              // the other party only ever found out by opening the app.
              if (car) {
                await notify({
                  userId: car.ownerId,
                  type: 'booking_status',
                  title: requestType === 'extend' ? 'Trip extension requested' : 'Early return requested',
                  message: `${customerName} asked to ${actionLabel} for booking ${booking.id} — new return date ${formatShortDate(effectiveDraftDropoff)}.`,
                  target: { kind: 'booking', id: booking.id },
                });
              }
            } else if (result.error) {
              Alert.alert("Couldn't Send Request", result.error);
            }
          },
        },
      ],
    );
  };

  const onWithdrawExtensionRequest = (request: ExtensionRequest) => {
    Alert.alert('Withdraw Request', 'Withdraw this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          const result = await cancelExtensionRequest(request.id);
          if (result.success) {
            setExtensionRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, status: 'cancelled' } : r)));
            if (car) {
              await notify({
                userId: car.ownerId,
                type: 'booking_status',
                title: 'Trip change request withdrawn',
                message: `${customerName} withdrew their request for booking ${booking.id}.`,
                target: { kind: 'booking', id: booking.id },
              });
            }
          } else if (result.error) {
            Alert.alert("Couldn't Withdraw", result.error);
          }
        },
      },
    ]);
  };

  // The owner's Approve dialog explicitly discloses that price isn't
  // auto-adjusted -- see 0010's migration comment for why recomputing a
  // correct total here isn't safe to do blind.
  const onRespondExtensionRequest = (request: ExtensionRequest, approve: boolean) => {
    const title = approve ? 'Approve Request' : 'Reject Request';
    const message = approve
      ? `Move this trip's return date to ${formatShortDate(request.requestedDropoffDate)}? VELORA doesn't automatically adjust the price for this change — settle any difference directly with ${customerName}.`
      : `Decline this request? ${customerName} will be notified.`;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: approve ? 'Approve' : 'Reject',
        style: approve ? 'default' : 'destructive',
        onPress: async () => {
          setExtensionBusy(true);
          const result = await respondToExtensionRequest(request, approve);
          setExtensionBusy(false);
          if (result.success) {
            setExtensionRequests((prev) =>
              prev.map((r) => (r.id === request.id ? { ...r, status: approve ? 'approved' : 'rejected' } : r)),
            );
            if (approve) refreshBookings();
            await notify({
              userId: booking.renterId,
              type: 'booking_status',
              title: approve ? 'Trip change approved' : 'Trip change declined',
              message: approve
                ? `Your request for booking ${booking.id} was approved — new return date ${formatShortDate(request.requestedDropoffDate)}.`
                : `Your request for booking ${booking.id} was declined.`,
              target: { kind: 'booking', id: booking.id },
            });
          } else if (result.error) {
            Alert.alert("Couldn't Respond", result.error);
          }
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
            {/* PHASE 6 -- Countdown, display-only (see utils/bookingCountdown.ts
                for why nothing here auto-expires the request). The renter's
                existing Cancel Booking action below was already available for
                a pending booking before this existed -- this just makes the
                timing expectation explicit for both sides. */}
            {booking.status === 'pending' ? (
              <Text style={[styles.countdownText, isResponseOverdue(booking.createdAt, nowTick) ? { color: colors.danger } : undefined]}>
                {isOwnerView
                  ? isResponseOverdue(booking.createdAt, nowTick)
                    ? "You're overdue to respond to this request"
                    : formatResponseCountdown(booking.createdAt, nowTick)
                  : isResponseOverdue(booking.createdAt, nowTick)
                    ? 'Response window has passed — you can cancel this request below'
                    : `Owner ${formatResponseCountdown(booking.createdAt, nowTick)}`}
              </Text>
            ) : null}
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
                This booking was paid before it was {booking.status === 'rejected' ? 'declined' : 'cancelled'}. VELORA has no
                payment gateway connected yet, so refunds are handled outside the app for now — message the{' '}
                {isOwnerView ? 'customer' : 'owner'} to arrange one.
              </Text>
            </View>
          ) : null}
        </View>

        {/* PHASE 7 -- Condition Photos. See CONDITION_PHOTOS_VISIBLE_STATUSES
            above for why 'pending'/'cancelled'/'rejected' are excluded. */}
        {CONDITION_PHOTOS_VISIBLE_STATUSES.includes(booking.status) ? (
          <>
            <Text style={styles.sectionTitle}>Condition Photos</Text>
            <View style={[styles.card, shadows.sm]}>
              <ConditionPhotoSection
                label="Pickup"
                photos={photos.filter((p) => p.stage === 'pickup')}
                loading={photosLoading}
                uploading={uploadingStage === 'pickup'}
                onAdd={() => onAddConditionPhoto('pickup')}
                onRemove={onRemoveConditionPhoto}
              />
              <View style={styles.divider} />
              <ConditionPhotoSection
                label="Return"
                photos={photos.filter((p) => p.stage === 'return')}
                loading={photosLoading}
                uploading={uploadingStage === 'return'}
                onAdd={() => onAddConditionPhoto('return')}
                onRemove={onRemoveConditionPhoto}
              />
            </View>
          </>
        ) : null}

        {/* PHASE 7 -- Trip Extension / Early Return. See
            TRIP_CHANGE_VISIBLE_STATUSES above for the status gate. */}
        {TRIP_CHANGE_VISIBLE_STATUSES.includes(booking.status) ? (
          <>
            <Text style={styles.sectionTitle}>Trip Changes</Text>
            <View style={[styles.card, shadows.sm]}>
              {pendingExtensionRequest ? (
                <View>
                  <Text style={styles.extensionStatusText}>
                    {pendingExtensionRequest.requestType === 'extend' ? 'Extension' : 'Early return'} requested — new
                    return date {formatShortDate(pendingExtensionRequest.requestedDropoffDate)}. Waiting on{' '}
                    {isOwnerView ? 'your response' : 'the owner'}.
                  </Text>
                  {isOwnerView ? (
                    <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                      <PrimaryButton
                        label="Approve"
                        onPress={() => onRespondExtensionRequest(pendingExtensionRequest, true)}
                        size="sm"
                        style={{ flex: 1, marginRight: spacing.sm }}
                        disabled={extensionBusy}
                      />
                      <PrimaryButton
                        label="Reject"
                        onPress={() => onRespondExtensionRequest(pendingExtensionRequest, false)}
                        size="sm"
                        variant="danger"
                        style={{ flex: 1 }}
                        disabled={extensionBusy}
                      />
                    </View>
                  ) : (
                    <PrimaryButton
                      label="Withdraw Request"
                      onPress={() => onWithdrawExtensionRequest(pendingExtensionRequest)}
                      variant="outline"
                      size="sm"
                      style={{ marginTop: spacing.sm }}
                    />
                  )}
                </View>
              ) : isOwnerView ? (
                <Text style={styles.extensionEmptyText}>
                  {extensionLoading ? 'Checking for requests…' : `No pending request from ${customerName}.`}
                </Text>
              ) : (
                <View>
                  <View style={styles.extensionStepperRow}>
                    <Pressable style={styles.extensionStepperButton} onPress={() => onAdjustDraftDropoff(-1)} hitSlop={6}>
                      <Ionicons name="remove" size={18} color={colors.textPrimary} />
                    </Pressable>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={styles.extensionStepperLabel}>New Return Date</Text>
                      <Text style={styles.extensionStepperValue}>{formatShortDate(effectiveDraftDropoff)}</Text>
                    </View>
                    <Pressable style={styles.extensionStepperButton} onPress={() => onAdjustDraftDropoff(1)} hitSlop={6}>
                      <Ionicons name="add" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </View>
                  {effectiveDraftDropoff !== normalizedDropoffDate ? (
                    <PrimaryButton
                      label={extensionBusy ? 'Sending…' : 'Send Request'}
                      onPress={onSendExtensionRequest}
                      size="sm"
                      style={{ marginTop: spacing.sm }}
                      disabled={extensionBusy}
                    />
                  ) : (
                    <Text style={styles.extensionEmptyText}>
                      Current return date: {formatShortDate(booking.dropoffDate)}. Adjust it above to request a
                      change.
                    </Text>
                  )}
                </View>
              )}
            </View>
          </>
        ) : null}

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

// PHASE 7 -- one Pickup or Return sub-section: a horizontally-scrolling row
// of thumbnails (each with a small remove badge) plus a trailing "Add Photo"
// tile. Kept as its own component (rather than inlined twice above) so the
// Pickup and Return sub-sections can never drift out of sync with each other.
const ConditionPhotoSection: React.FC<{
  label: string;
  photos: BookingConditionPhoto[];
  loading: boolean;
  uploading: boolean;
  onAdd: () => void;
  onRemove: (photo: BookingConditionPhoto) => void;
}> = ({ label, photos, loading, uploading, onAdd, onRemove }) => (
  <View>
    <Text style={styles.conditionLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.conditionRow}>
      {photos.map((photo) => (
        <View key={photo.id} style={styles.conditionThumbWrap}>
          <FallbackImage uri={photo.url} style={styles.conditionThumb} iconSize={18} />
          <Pressable style={styles.conditionRemoveBadge} onPress={() => onRemove(photo)} hitSlop={6}>
            <Ionicons name="close" size={12} color={colors.card} />
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.conditionAddTile} onPress={onAdd} disabled={uploading} hitSlop={6}>
        <Ionicons name={uploading ? 'hourglass-outline' : 'camera-outline'} size={20} color={colors.textSecondary} />
        <Text style={styles.conditionAddText}>{uploading ? 'Uploading…' : 'Add Photo'}</Text>
      </Pressable>
    </ScrollView>
    {!loading && photos.length === 0 ? (
      <Text style={styles.conditionEmptyText}>No {label.toLowerCase()} photos yet.</Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg },
  statusBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  statusLabel: { ...typography.titleLg, fontWeight: '700' },
  statusNote: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  countdownText: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontWeight: '700' },
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
  conditionLabel: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.sm },
  conditionRow: { alignItems: 'center', paddingBottom: 2 },
  conditionThumbWrap: { marginRight: spacing.sm },
  conditionThumb: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surface },
  conditionRemoveBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionAddTile: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionAddText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  conditionEmptyText: { ...typography.bodySm, color: colors.textTertiary, marginTop: spacing.xs },
  extensionStatusText: { ...typography.bodyMd, color: colors.textPrimary, lineHeight: 20 },
  extensionEmptyText: { ...typography.bodySm, color: colors.textTertiary },
  extensionStepperRow: { flexDirection: 'row', alignItems: 'center' },
  extensionStepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extensionStepperLabel: { ...typography.caption, color: colors.textSecondary },
  extensionStepperValue: { ...typography.titleMd, color: colors.textPrimary, marginTop: 2 },
});
