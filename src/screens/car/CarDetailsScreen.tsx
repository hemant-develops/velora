import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { brands } from '../../data/brands';
import { ImageCarousel } from '../../components/ImageCarousel';
import { CircleIconButton } from '../../components/CircleIconButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { FavoriteButton } from '../../components/FavoriteButton';
import { Rating } from '../../components/Rating';
import { SpecificationCard } from '../../components/SpecificationCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useCars } from '../../context/CarsContext';
import { useAuth } from '../../context/AuthContext';
import { useReviews } from '../../context/ReviewsContext';
import { formatCurrency, formatShortDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'CarDetails'>;

const DESCRIPTION_PREVIEW_LENGTH = 120;

export const CarDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { getCarById } = useCars();
  const { user, getUserById } = useAuth();
  const { getReviewsForCar } = useReviews();
  const car = getCarById(route.params.carId);
  const [expanded, setExpanded] = useState(false);

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
  const owner = getUserById(car.ownerId);
  const isOwnCar = user?.id === car.ownerId;

  const onMessageOwner = () => {
    navigation.navigate('ConversationDetail', {
      carId: car.id,
      carName: car.name,
      ownerId: car.ownerId,
      ownerName: owner?.name ?? 'Car Owner',
      ownerAvatar: owner?.avatar,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View>
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
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
              </Pressable>
            )
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

          <Text style={styles.sectionTitle}>Specifications</Text>
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

          <Text style={styles.sectionTitle}>Pricing</Text>
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

          <Text style={styles.sectionTitle}>Reviews {car.reviewCount > 0 ? `(${car.reviewCount})` : ''}</Text>
          {(() => {
            const reviews = getReviewsForCar(car.id);
            if (reviews.length === 0) {
              return <Text style={styles.noReviewsText}>No reviews yet — be the first to rent and review this car.</Text>;
            }
            return reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <Text style={styles.reviewerName}>{review.renterName}</Text>
                  <Rating value={review.rating} size={13} />
                </View>
                {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                <Text style={styles.reviewDate}>{formatShortDate(review.createdAt)}</Text>
              </View>
            ));
          })()}
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
        ) : car.isActive === false ? (
          <>
            <View>
              <Text style={styles.priceLabel}>Unavailable</Text>
              <Text style={styles.taxesText}>The owner has hidden this car right now</Text>
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
              <Text style={styles.taxesText}>From, excl. taxes &amp; fees</Text>
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
  reviewCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  reviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { ...typography.titleMd, color: colors.textPrimary },
  reviewComment: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  reviewDate: { ...typography.caption, color: colors.textTertiary, marginTop: 6 },
});
