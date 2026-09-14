import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ImageCarousel } from '../../components/ImageCarousel';
import { CircleIconButton } from '../../components/CircleIconButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { FavoriteButton } from '../../components/FavoriteButton';
import { Rating } from '../../components/Rating';
import { SpecificationCard } from '../../components/SpecificationCard';
import { CarCard } from '../../components/CarCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { CarDetailsSkeleton } from '../../components/SkeletonLoader';
import { FAQAccordion } from '../../components/FAQAccordion';
import { useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';
import { useAuth } from '../../context/AuthContext';
import { useReviews } from '../../context/ReviewsContext';
import { usePublicProfile } from '../../hooks/usePublicProfile';
import { formatCurrency, formatShortDate } from '../../utils/format';
import { getCarQuantity } from '../../utils/inventory';
import { fetchHostReliability, HostReliability } from '../../utils/hostReliability';
import { getReviewTags } from '../../utils/reviewTags';
import { BOOKING_REQUIREMENTS_TEXT, CANCELLATION_POLICY_TEXT, CAR_DETAILS_FAQS, DEPOSIT_NOTICE_TEXT } from '../../utils/policy';

type Props = NativeStackScreenProps<RootStackParamList, 'CarDetails'>;

const DESCRIPTION_PREVIEW_LENGTH = 120;

export const CarDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { cars, getCarById, isLoaded: carsLoaded } = useCars();
  const { brands } = useCatalog();
  const { user } = useAuth();
  const { getReviewsForCar } = useReviews();
  const car = getCarById(route.params.carId);
  const [expanded, setExpanded] = useState(false);
  // Final non-payment hardening -- TARGET 1: resolves the real owner
  // name/avatar for the "Listed by" row below via the public-safe RPC, not
  // just for the current user's own cars (getUserById alone could never
  // resolve anyone else, per profiles_select_own).
  const { profile: owner } = usePublicProfile(car?.ownerId);

  // MULTI-DEVICE MIGRATION -- see utils/hostReliability.ts's
  // fetchHostReliability comment: BookingsContext's own state is RLS-scoped
  // to bookings THIS signed-in user can see, which is empty for a random
  // owner's cars when the viewer is a renter who's never booked from them --
  // so this now goes through a SECURITY DEFINER RPC instead. Declared before
  // any early return below, per the Rules of Hooks.
  const [reliability, setReliability] = useState<HostReliability | null>(null);
  useEffect(() => {
    const targetOwnerId = owner?.id;
    if (!targetOwnerId) {
      setReliability(null);
      return;
    }
    let cancelled = false;
    fetchHostReliability(targetOwnerId).then((result) => {
      if (!cancelled) setReliability(result);
    });
    return () => {
      cancelled = true;
    };
  }, [owner?.id]);

  // CarsContext reads its store from Supabase asynchronously, same as every
  // other screen gated on `isLoaded` (Home, Favorites, ...) -- without this
  // check, a cold start briefly rendered "Car not found" for a perfectly
  // valid carId before the catalog had actually finished loading. Preserves
  // the exact same genuine not-found behavior below once loading has
  // actually finished.
  if (!carsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <CarDetailsSkeleton topInset={insets.top} />
      </View>
    );
  }

  if (!car) {
    // Every other "not found" screen in the app (Owner Profile, Customer
    // Profile, Booking Details, Conversation) gives the person an explicit
    // way back rather than relying on the hardware back button/swipe
    // gesture alone — this matches that pattern instead of being the one
    // real dead end for a stale/invalid carId (an old notification, a
    // favorite whose car was removed, a bad deep link).
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Car not found" subtitle="This listing may have been removed by its owner." />
      </View>
    );
  }

  const brandName = brands.find((b) => b.id === car.brandId)?.name;
  const showReadMore = car.description.length > DESCRIPTION_PREVIEW_LENGTH;
  const descriptionText =
    expanded || !showReadMore ? car.description : `${car.description.slice(0, DESCRIPTION_PREVIEW_LENGTH)}... `;
  const supportsBoth = car.rentalModes.length > 1;
  const isOwnCar = user?.id === car.ownerId;
  // Host reliability -- see the useEffect above (fetchHostReliability),
  // computed server-side from this owner's OWN real booking records across
  // every car they list (see utils/hostReliability.ts), not a stored/static
  // field.
  const isOwnerVerified = owner?.ownerVerification?.status === 'verified';
  const reviews = getReviewsForCar(car.id);
  const reviewTags = getReviewTags(reviews);
  // Similar Cars -- real marketplace discovery (same category, excluding
  // this car itself, active listings only since `cars` is CarsContext's
  // already-active-filtered list), sorted by each car's own real rating.
  // No fabricated "recommended for you" personalization -- just an honest
  // "more like this" row, the same data CarCard/Home already trust.
  const similarCars = cars
    .filter((c) => c.id !== car.id && c.category === car.category)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6);

  const onMessageOwner = () => {
    navigation.navigate('ConversationDetail', {
      carId: car.id,
      carName: car.name,
      ownerId: car.ownerId,
      ownerName: owner?.name ?? 'Car Owner',
      ownerAvatar: owner?.avatar,
    });
  };

  // Quick-jump section nav -- a lightweight, low-risk reinterpretation of the
  // reference app's horizontal pill-tab bar (Photos/Reviews/Deposit/... as
  // separate tabs) that keeps VELORA's actual structure: everything still
  // lives in ONE real ScrollView with the exact same data/components/booking
  // flow underneath (no new mounted screens, nothing that could touch the
  // frozen booking logic) -- tapping a pill just scrolls to that section
  // instead of swapping content. `sectionOffsets` is a plain ref (not
  // state) since it only needs to be read at scroll-time, not re-rendered
  // on write; `headerHeight` is measured for real via onLayout rather than
  // assumed, since the gallery's height can vary.
  const scrollRef = useRef<ScrollView>(null);
  const headerHeight = useRef(0);
  const sectionOffsets = useRef<Record<string, number>>({}).current;
  const onHeaderLayout = (e: LayoutChangeEvent) => {
    headerHeight.current = e.nativeEvent.layout.height;
  };
  const onSectionLayout = (key: string) => (e: LayoutChangeEvent) => {
    sectionOffsets[key] = e.nativeEvent.layout.y;
  };
  const scrollToSection = (key: string) => {
    const y = sectionOffsets[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: headerHeight.current + y - spacing.sm, animated: true });
  };
  const JUMP_SECTIONS: { key: string; label: string }[] = [
    { key: 'specs', label: 'Specs' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'policies', label: 'Policies' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'reviews', label: 'Reviews' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scrollRef} bounces={false} contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View onLayout={onHeaderLayout}>
          <ImageCarousel images={car.images} />
          <View style={[styles.headerRow, { top: insets.top + spacing.sm }]}>
            <CircleIconButton icon="arrow-back" onPress={() => navigation.goBack()} accessibilityLabel="Go back" />
            <View style={styles.headerRightRow}>
              {!isOwnCar ? (
                <CircleIconButton
                  icon="chatbubble-ellipses-outline"
                  onPress={onMessageOwner}
                  accessibilityLabel="Message the owner"
                  style={{ marginRight: spacing.sm }}
                />
              ) : null}
              <FavoriteButton carId={car.id} size={20} />
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={typography.displayMd}>{car.name}</Text>
              <Text style={styles.category}>
                {car.category}
                {brandName ? ` · ${brandName}` : ''}
                {car.year ? ` · ${car.year}` : ''}
              </Text>
            </View>
            {car.discountPercent ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>-{car.discountPercent}%</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.ratingRow}>
            <Rating value={car.rating} reviewCount={car.reviewCount} size={16} />
            <Text style={styles.locationText}>{car.location}</Text>
          </View>
          {owner ? (
            isOwnCar ? (
              <Text style={styles.listedBy}>Listed by {owner.name}</Text>
            ) : (
              <Pressable
                style={styles.listedByRow}
                onPress={() =>
                  navigation.navigate('OwnerProfile', { ownerId: owner.id, carId: car.id, carName: car.name })
                }
                hitSlop={6}
              >
                <Text style={styles.listedBy}>Listed by {owner.name}</Text>
                {isOwnerVerified ? (
                  <Ionicons name="shield-checkmark" size={13} color={colors.success} style={{ marginLeft: 5 }} />
                ) : null}
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
              </Pressable>
            )
          ) : null}
          {/* Host reliability -- a plain, factual line, not a badge/score
              graphic. Only shown once there's enough real concluded-trip
              history to be meaningful (see getHostReliability); otherwise
              nothing renders here at all rather than a "0/0" or a
              fabricated number. */}
          {reliability ? (
            <View style={styles.reliabilityRow}>
              <Ionicons name="checkmark-done-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.reliabilityText}>
                {reliability.fulfilled} of last {reliability.total} trips fulfilled
              </Text>
            </View>
          ) : null}

          <View style={styles.modeRow}>
            {car.rentalModes.includes('self_drive') ? (
              <View style={styles.modeTag}>
                <Ionicons name="car-sport-outline" size={13} color={colors.textPrimary} />
                <Text style={styles.modeTagText}>Self Drive available</Text>
              </View>
            ) : null}
            {car.rentalModes.includes('with_driver') ? (
              <View style={styles.modeTag}>
                <Ionicons name="person-outline" size={13} color={colors.textPrimary} />
                <Text style={styles.modeTagText}>Driver available</Text>
              </View>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.jumpNav} contentContainerStyle={{ paddingRight: spacing.lg }}>
            {JUMP_SECTIONS.map((section) => (
              <Pressable key={section.key} style={styles.jumpChip} onPress={() => scrollToSection(section.key)} hitSlop={4}>
                <Text style={styles.jumpChipText}>{section.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle} onLayout={onSectionLayout('specs')}>Specifications</Text>
          <View style={styles.specGrid}>
            <View style={styles.specItem}><SpecificationCard icon="speedometer-outline" label="Top Speed" value={`${car.topSpeed} km/h`} /></View>
            <View style={styles.specItem}><SpecificationCard icon="cog-outline" label="Transmission" value={car.transmission} /></View>
            <View style={styles.specItem}><SpecificationCard icon="water-outline" label="Fuel Type" value={car.fuelType} /></View>
            <View style={styles.specItem}><SpecificationCard icon="speedometer" label="Mileage" value={car.fuelEconomy} /></View>
            <View style={styles.specItem}><SpecificationCard icon="people-outline" label="Seats" value={`${car.seats}`} /></View>
            <View style={styles.specItem}><SpecificationCard icon="snow-outline" label="A/C" value="Available" /></View>
          </View>

          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featureRow}>
            {car.features.map((feature) => (
              <View key={feature} style={styles.featureChip}>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Details</Text>
          <Text style={styles.description}>
            {descriptionText}
            {showReadMore ? (
              <Text style={styles.readMore} onPress={() => setExpanded((e) => !e)}>
                {expanded ? ' Show Less' : 'Read More...'}
              </Text>
            ) : null}
          </Text>

          <Text style={styles.sectionTitle} onLayout={onSectionLayout('pricing')}>Pricing</Text>
          <View style={styles.pricingRow}>
            {car.rentalModes.includes('self_drive') ? (
              <View style={styles.priceCard}>
                <Text style={styles.priceCardLabel}>Self Drive</Text>
                <Text style={styles.priceCardValue}>{formatCurrency(car.pricePerDay)}<Text style={styles.priceCardUnit}>/day</Text></Text>
              </View>
            ) : null}
            {car.rentalModes.includes('with_driver') ? (
              <View style={[styles.priceCard, supportsBoth ? { marginLeft: spacing.sm } : undefined]}>
                <Text style={styles.priceCardLabel}>With Driver</Text>
                <Text style={styles.priceCardValue}>{formatCurrency(car.driverPricePerDay)}<Text style={styles.priceCardUnit}>/day</Text></Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle} onLayout={onSectionLayout('policies')}>Deposit &amp; Cancellation</Text>
          <View style={styles.policyCard}>
            <View style={styles.policyRow}>
              <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
              <View style={styles.policyTextWrap}>
                <Text style={styles.policyHeading}>Security Deposit</Text>
                <Text style={styles.policyBody}>{DEPOSIT_NOTICE_TEXT}</Text>
              </View>
            </View>
            <View style={styles.policyDivider} />
            <View style={styles.policyRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <View style={styles.policyTextWrap}>
                <Text style={styles.policyHeading}>Cancellation Policy</Text>
                <Text style={styles.policyBody}>{CANCELLATION_POLICY_TEXT}</Text>
              </View>
            </View>
            <View style={styles.policyDivider} />
            <View style={styles.policyRow}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
              <View style={styles.policyTextWrap}>
                <Text style={styles.policyHeading}>Booking Requirements</Text>
                <Text style={styles.policyBody}>{BOOKING_REQUIREMENTS_TEXT}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle} onLayout={onSectionLayout('faqs')}>Frequently Asked Questions</Text>
          <FAQAccordion items={CAR_DETAILS_FAQS} />

          <Text style={styles.sectionTitle} onLayout={onSectionLayout('reviews')}>Reviews {car.reviewCount > 0 ? `(${car.reviewCount})` : ''}</Text>
          {reviewTags.length > 0 ? (
            <View style={styles.tagRow}>
              {reviewTags.map((tag) => (
                <View key={tag.key} style={[styles.tagChip, tag.tone === 'positive' ? styles.tagChipPositive : styles.tagChipCaution]}>
                  <Text style={styles.tagText}>{tag.label} · {tag.count}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {reviews.length === 0 ? (
            <Text style={styles.noReviewsText}>No reviews yet — be the first to rent and review this car.</Text>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <Text style={styles.reviewerName}>{review.renterName}</Text>
                  <Rating value={review.rating} size={13} />
                </View>
                {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                <Text style={styles.reviewDate}>{formatShortDate(review.createdAt)}</Text>
              </View>
            ))
          )}

          {similarCars.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>Similar Cars</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
                {similarCars.map((similar) => (
                  <CarCard
                    key={similar.id}
                    car={similar}
                    variant="compact"
                    onPress={() => navigation.navigate('CarDetails', { carId: similar.id })}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {!isOwnCar ? (
            <Pressable
              style={styles.reportRow}
              onPress={() => navigation.navigate('Report', { targetKind: 'car', targetId: car.id, targetLabel: car.name })}
              hitSlop={6}
            >
              <Ionicons name="flag-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.reportRowText}>Report this listing</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bookingBar, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        {user?.id === car.ownerId ? (
          <>
            <View>
              <Text style={styles.priceLabel}>Your Listing</Text>
              <Text style={styles.taxesText}>You can't book your own car</Text>
            </View>
            <PrimaryButton
              label="Manage Listing"
              onPress={() => navigation.navigate('Main', { screen: 'RentsTab' })}
              fullWidth={false}
              variant="dark"
              style={{ paddingHorizontal: spacing.xxl }}
            />
          </>
        ) : car.isActive === false || getCarQuantity(car) <= 0 ? (
          <>
            <View>
              <Text style={styles.priceLabel}>Unavailable</Text>
              <Text style={styles.taxesText}>
                {car.isActive === false ? 'The owner has hidden this car right now' : 'Currently unavailable'}
              </Text>
            </View>
            <PrimaryButton
              label="Currently Unavailable"
              onPress={() => {}}
              disabled
              fullWidth={false}
              variant="outline"
              style={{ paddingHorizontal: spacing.lg }}
            />
          </>
        ) : (
          <>
            <View>
              <Text style={styles.priceLabel}>
                {formatCurrency(car.pricePerDay)}
                <Text style={styles.priceUnit}>/Day</Text>
              </Text>
              <Text style={styles.taxesText}>
                {getCarQuantity(car)} car{getCarQuantity(car) === 1 ? '' : 's'} available · excl. taxes &amp; fees
              </Text>
            </View>
            <PrimaryButton
              label="Book Now"
              onPress={() => navigation.navigate('Booking', { carId: car.id })}
              fullWidth={false}
              style={{ paddingHorizontal: spacing.xxl }}
            />
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerRightRow: { flexDirection: 'row', alignItems: 'center' },
  listedBy: { ...typography.bodySm, color: colors.textTertiary, marginTop: 4 },
  listedByRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 4 },
  reliabilityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  reliabilityText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 5 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  category: { ...typography.bodyMd, color: colors.textSecondary, marginTop: 4 },
  discountBadge: { backgroundColor: colors.successBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  discountText: { ...typography.bodySm, color: colors.success, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  locationText: { ...typography.bodySm, color: colors.textSecondary },
  modeRow: { flexDirection: 'row', marginTop: spacing.sm },
  modeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: spacing.xs },
  modeTagText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', marginLeft: 5 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  jumpNav: { marginTop: spacing.lg },
  jumpChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginRight: spacing.xs,
  },
  jumpChipText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700' },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  specItem: { width: '33.33%', padding: 4 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap' },
  featureChip: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 7, marginRight: spacing.xs, marginBottom: spacing.xs },
  featureText: { ...typography.bodySm, color: colors.textPrimary },
  description: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 22 },
  readMore: { ...typography.titleMd, color: colors.primaryDark },
  pricingRow: { flexDirection: 'row' },
  priceCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
  priceCardLabel: { ...typography.bodySm, color: colors.textSecondary },
  priceCardValue: { ...typography.headingSm, color: colors.textPrimary, marginTop: 4 },
  priceCardUnit: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '400' },
  bookingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  priceLabel: { ...typography.headingLg, color: colors.textPrimary },
  priceUnit: { ...typography.bodyMd, color: colors.textSecondary, fontWeight: '400' },
  taxesText: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  noReviewsText: { ...typography.bodyMd, color: colors.textSecondary },
  reportRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.lg, paddingVertical: spacing.xs },
  reportRowText: { ...typography.bodySm, color: colors.textTertiary, marginLeft: 6 },
  reviewCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  reviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { ...typography.titleMd, color: colors.textPrimary },
  reviewComment: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  reviewDate: { ...typography.caption, color: colors.textTertiary, marginTop: 6 },
  policyCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  policyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  policyTextWrap: { flex: 1, marginLeft: spacing.sm },
  policyHeading: { ...typography.titleMd, color: colors.textPrimary },
  policyBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  policyDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  tagChip: { borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 6, marginRight: spacing.xs, marginBottom: spacing.xs, borderWidth: 1 },
  tagChipPositive: { backgroundColor: colors.successBg, borderColor: colors.successBg },
  tagChipCaution: { backgroundColor: colors.warningBg, borderColor: colors.warningBg },
  tagText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
