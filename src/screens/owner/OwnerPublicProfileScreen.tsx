import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FallbackImage } from '../../components/FallbackImage';
import { Rating } from '../../components/Rating';
import { ProfileCompleteBadge } from '../../components/ProfileCompleteBadge';
import { PublicProfileSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { usePublicProfile } from '../../hooks/usePublicProfile';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../utils/format';
import { getProfileCompleteness } from '../../utils/profile';
import { fetchHostReliability, HostReliability } from '../../utils/hostReliability';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerProfile'>;

// A read-only, PUBLIC view of a rental owner -- shown to a renter who taps
// "Listed by ..." or the owner row on a car card. Deliberately shows only
// public-safe fields: never the owner's email/phone or their raw Owner
// Verification submission (ID number, etc.) -- only a "Verified" badge
// derived from its status.
export const OwnerPublicProfileScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user: currentUser } = useAuth();
  const { getCarsByOwner } = useCars();
  const { ownerId, carId, carName } = route.params;
  const isSelf = currentUser?.id === ownerId;
  // Final non-payment hardening -- TARGET 1: resolves the real owner via the
  // public-safe RPC (profiles_select_own still blocks a direct lookup of
  // anyone but yourself, unchanged).
  const { profile: owner, isLoading: ownerLoading } = usePublicProfile(isSelf ? undefined : ownerId);

  // MULTI-DEVICE MIGRATION -- see utils/hostReliability.ts's
  // fetchHostReliability comment: this now has to go through a
  // SECURITY DEFINER RPC instead of reading BookingsContext's own (RLS-
  // scoped, so empty for someone else's bookings) local state. Declared
  // before any early return below, per the Rules of Hooks -- the effect
  // itself no-ops for the isSelf case.
  const [reliability, setReliability] = useState<HostReliability | null>(null);
  useEffect(() => {
    if (isSelf || !ownerId) {
      setReliability(null);
      return;
    }
    let cancelled = false;
    fetchHostReliability(ownerId).then((result) => {
      if (!cancelled) setReliability(result);
    });
    return () => {
      cancelled = true;
    };
  }, [isSelf, ownerId]);

  // TWO-WAY REVIEWS -- the owner's OWN rating from Customer -> Owner
  // reviews (0029_two_way_reviews.sql), distinct from the car-rating
  // aggregate computed below. owner_stores' rating/review_count is kept
  // authoritative by a trigger, so this is a plain read, never a client
  // computation.
  const [ownerRating, setOwnerRating] = useState<{ rating: number; reviewCount: number } | null>(null);
  useEffect(() => {
    if (isSelf || !ownerId) {
      setOwnerRating(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('owner_stores')
      .select('rating, review_count')
      .eq('owner_id', ownerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.log(`VELORA_OWNER_RATING_FETCH_ERROR: ${error.message}`);
          return;
        }
        if (data && data.review_count > 0) setOwnerRating({ rating: Number(data.rating), reviewCount: data.review_count });
      });
    return () => {
      cancelled = true;
    };
  }, [isSelf, ownerId]);

  // Never show a broken "public profile of yourself" loop -- a renter can
  // only ever reach this screen for someone else's car, but guard it here
  // too in case a future entry point doesn't already exclude it.
  if (isSelf) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
        <EmptyState icon="person-circle-outline" title="This is you" subtitle="Manage your own profile from the Profile tab instead." />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <PrimaryButton label="Go to My Profile" onPress={() => navigation.navigate('Main', { screen: 'ProfileTab' })} />
        </View>
      </View>
    );
  }

  const allListedCars = getCarsByOwner(ownerId);
  // Renters browsing this public profile should only ever see cars the
  // owner has made Active — an inactive car isn't bookable and shouldn't
  // appear in the owner's public "Listed Cars" list, mirroring the same
  // active-only filtering CarsContext already applies to search/listing.
  const listedCars = allListedCars.filter((c) => c.isActive !== false);
  const allCarsInactive = allListedCars.length > 0 && listedCars.length === 0;

  if (ownerLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Owner Profile" onBack={() => navigation.goBack()} />
        <PublicProfileSkeleton showListings />
      </View>
    );
  }

  if (!owner) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Profile not found" />
      </View>
    );
  }

  // Rating shown here is a real, derived aggregate across this owner's own
  // listed cars (each car's rating/reviewCount is itself only ever updated
  // from actual submitted reviews -- see ReviewsContext / CarsContext).
  // Never a fabricated number, and simply omitted when nothing exists yet.
  const ratedCars = listedCars.filter((c) => c.reviewCount > 0);
  const totalReviews = ratedCars.reduce((sum, c) => sum + c.reviewCount, 0);
  const aggregateRating =
    totalReviews > 0
      ? Math.round((ratedCars.reduce((sum, c) => sum + c.rating * c.reviewCount, 0) / totalReviews) * 10) / 10
      : null;

  const isVerified = owner.ownerVerification?.status === 'verified';
  const isProfileComplete = getProfileCompleteness(owner).isComplete;
  // Host reliability -- see the useEffect above (fetchHostReliability),
  // same honest, purely-derived calculation used on CarDetailsScreen,
  // computed server-side across ALL of this owner's real bookings.

  // Every conversation is tied to a specific car (existing MessagesContext
  // data model) -- use the car the person tapped through from if we have
  // one, otherwise fall back to this owner's first listing so "Message
  // Owner" from a profile still has a valid subject.
  const messageCar = carId && carName ? { id: carId, name: carName } : listedCars[0] ? { id: listedCars[0].id, name: listedCars[0].name } : null;

  const onMessageOwner = () => {
    if (!messageCar) return;
    navigation.navigate('ConversationDetail', {
      carId: messageCar.id,
      carName: messageCar.name,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerAvatar: owner.avatar,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Owner Profile" onBack={() => navigation.goBack()} />

      <View style={styles.profileCard}>
        <Image source={{ uri: owner.avatar }} style={styles.avatar} />
        <View style={styles.nameRow}>
          <Text style={typography.headingMd}>{owner.name}</Text>
          {isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={13} color={colors.success} />
              <Text style={styles.verifiedText}>Verified Owner</Text>
            </View>
          ) : null}
        </View>
        {!isVerified && isProfileComplete ? (
          <View style={{ marginTop: 6 }}>
            <ProfileCompleteBadge />
          </View>
        ) : null}
        {owner.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{owner.location}</Text>
          </View>
        ) : null}
        {owner.createdAt ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>Member since {formatDate(owner.createdAt)}</Text>
          </View>
        ) : null}
        {aggregateRating !== null ? (
          <View style={[styles.metaRow, { marginTop: 6 }]}>
            <Text style={styles.ratingLabel}>Cars:</Text>
            <Rating value={aggregateRating} reviewCount={totalReviews} size={14} />
          </View>
        ) : null}
        {ownerRating ? (
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <Text style={styles.ratingLabel}>Owner:</Text>
            <Rating value={ownerRating.rating} reviewCount={ownerRating.reviewCount} size={14} />
          </View>
        ) : null}
        {/* Plain, factual line -- not a score graphic or a percentage badge.
            Only rendered once there's enough concluded-trip history to be
            meaningful (see getHostReliability's own threshold). */}
        {reliability ? (
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <Ionicons name="checkmark-done-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{reliability.fulfilled} of last {reliability.total} trips fulfilled</Text>
          </View>
        ) : null}
      </View>

      {allCarsInactive ? (
        <View style={styles.unavailableBanner}>
          <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
          <Text style={styles.unavailableBannerText}>Currently unavailable — this owner has no active listings right now.</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.bodyText}>{owner.bio?.trim() || 'Not added yet.'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Listed Cars ({listedCars.length})</Text>
        {listedCars.length === 0 ? (
          <Text style={styles.bodyText}>No cars listed yet.</Text>
        ) : (
          listedCars.map((car) => (
            <Pressable key={car.id} style={styles.carRow} onPress={() => navigation.navigate('CarDetails', { carId: car.id })}>
              <FallbackImage uri={car.images[0]} style={styles.carImage} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={typography.titleMd} numberOfLines={1}>{car.name}</Text>
                <Text style={styles.carMeta} numberOfLines={1}>{formatCurrency(car.pricePerDay)}/day · {car.location}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}
      </View>

      {messageCar ? (
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <PrimaryButton
            label="Message Owner"
            onPress={onMessageOwner}
            icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onPrimary} />}
          />
        </View>
      ) : null}

      <Pressable
        style={styles.reportRow}
        onPress={() => navigation.navigate('Report', { targetKind: 'user', targetId: owner.id, targetLabel: owner.name })}
        hitSlop={6}
      >
        <Ionicons name="flag-outline" size={15} color={colors.textTertiary} />
        <Text style={styles.reportRowText}>Report this owner</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface, marginBottom: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: spacing.sm,
  },
  verifiedText: { ...typography.caption, color: colors.success, fontWeight: '700', marginLeft: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 4 },
  ratingLabel: { ...typography.bodySm, color: colors.textTertiary, marginRight: 4, fontWeight: '600' },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  bodyText: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 21 },
  carRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm },
  carImage: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  unavailableBannerText: { ...typography.bodySm, color: colors.warning, marginLeft: 8, flex: 1, lineHeight: 18 },
  reportRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.xs },
  reportRowText: { ...typography.bodySm, color: colors.textTertiary, marginLeft: 6 },
});
