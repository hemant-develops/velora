import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Car, RentalMode } from '../types';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { Rating } from './Rating';
import { FallbackImage } from './FallbackImage';
import { FavoriteButton } from './FavoriteButton';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { usePublicProfile } from '../hooks/usePublicProfile';
import { useAppNavigation } from '../navigation/hooks';

interface Props {
  car: Car;
  onPress: () => void;
  onPressBook?: () => void;
  variant?: 'large' | 'compact';
}

export const CarCard: React.FC<Props> = ({ car, onPress, onPressBook, variant = 'large' }) => {
  const isCompact = variant === 'compact';
  const { user } = useAuth();
  const navigation = useAppNavigation();
  const isOwnCar = user?.id === car.ownerId;
  // M10 hardening: previously used the raw AuthContext cache (getUserById),
  // which only ever resolves the signed-in user's own profile or an id some
  // other screen already fetched -- so the owner row on this, the single
  // most-shown card in the whole app (Home, Search, Favorites, Brand lists),
  // silently disappeared for almost every listing that wasn't the viewer's
  // own. usePublicProfile resolves it via the same public-safe RPC already
  // used on Car Details / public profile screens (name + avatar only). For
  // the viewer's own car, skip the fetch entirely and just show their own
  // already-loaded profile.
  const { profile: fetchedOwner } = usePublicProfile(isOwnCar ? undefined : car.ownerId);
  const owner = isOwnCar ? user : fetchedOwner;

  const onPressOwner = () => {
    if (isOwnCar) {
      navigation.navigate('Main', { screen: 'ProfileTab' });
    } else {
      navigation.navigate('OwnerProfile', { ownerId: car.ownerId, carId: car.id, carName: car.name });
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        shadows.sm,
        isCompact ? styles.cardCompact : undefined,
        pressed ? styles.cardPressed : undefined,
      ]}
    >
      <View style={[styles.imageWrap, isCompact ? styles.imageWrapCompact : undefined]}>
        <FallbackImage uri={car.images[0]} style={styles.image} />
        {car.discountPercent ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{car.discountPercent}%</Text>
          </View>
        ) : null}
        <FavoriteButton carId={car.id} style={styles.favBtn} size={16} />
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={typography.titleLg} numberOfLines={1}>
            {car.name}
          </Text>
          {!isCompact ? <Rating value={car.rating} reviewCount={car.reviewCount} /> : null}
        </View>

        {isCompact ? <Rating value={car.rating} reviewCount={car.reviewCount} compact /> : null}

        {owner ? (
          <Pressable
            style={styles.ownerRow}
            onPress={onPressOwner}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={isOwnCar ? 'Your listing' : `View ${owner.name}'s profile`}
          >
            <FallbackImage uri={owner.avatar} style={styles.ownerAvatar} iconSize={12} />
            <Text style={styles.ownerName} numberOfLines={1}>
              {isOwnCar ? 'Your listing' : owner.name}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
          </Pressable>
        ) : null}

        <View style={styles.modeRow}>
          {car.rentalModes.map((mode: RentalMode) => (
            <View key={mode} style={styles.modeTag}>
              <Text style={styles.modeTagText}>{mode === 'self_drive' ? 'Self Drive' : 'With Driver'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.specLine} numberOfLines={1}>
          {[car.year ? String(car.year) : null, car.transmission, car.fuelType, `${car.seats} Seats`]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.price}>
            {formatCurrency(car.pricePerDay)}
            <Text style={styles.priceUnit}> /day</Text>
          </Text>
          {onPressBook ? (
            <Pressable
              style={({ pressed }) => [styles.bookBtn, pressed ? styles.bookBtnPressed : undefined]}
              onPress={onPressBook}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Book ${car.name}`}
            >
              <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  // Subtle press feedback (opacity dip) so tapping a listing feels
  // responsive rather than static -- deliberately cheap (no Animated API,
  // no scale transform that could jank on lower-end Android devices), just
  // Pressable's own per-press style function.
  cardPressed: { opacity: 0.92 },
  cardCompact: { width: 220, marginRight: spacing.md, marginBottom: 0 },
  imageWrap: { width: '100%', height: 170 },
  imageWrapCompact: { height: 130 },
  image: { width: '100%', height: '100%' },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  discountText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  favBtn: { position: 'absolute', top: 10, left: 10 },
  info: { padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, alignSelf: 'flex-start' },
  ownerAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, marginRight: 5 },
  ownerName: { ...typography.caption, color: colors.textSecondary, marginRight: 3, maxWidth: 130 },
  modeRow: { flexDirection: 'row', marginTop: 8 },
  modeTag: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  modeTagText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  specLine: { ...typography.caption, color: colors.textTertiary, marginTop: 6 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  price: { ...typography.headingSm, color: colors.textPrimary },
  priceUnit: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '400' },
  bookBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnPressed: { backgroundColor: colors.primaryDark },
});
