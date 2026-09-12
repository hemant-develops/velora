import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../theme';

// A single pulsing placeholder block. Deliberately a plain opacity pulse
// (not a moving shimmer gradient) -- it reads as "loading" just as clearly,
// costs almost nothing to animate (one Animated.Value, native driver), and
// avoids the perf/complexity of a translating gradient layer on lower-end
// Android devices, matching the "avoid performance-heavy effects" and
// "avoid excessive animation" requirements.
export const SkeletonBlock: React.FC<{ width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }> = ({
  width = '100%',
  height = 16,
  radius = radii.sm,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { width, height, borderRadius: radius, opacity }, style]} />;
};

// Composed skeletons below mirror each real screen's actual layout (image
// block + title lines + meta line + price/button row) so the loading state
// doesn't jump/reflow once real content swaps in -- matching "skeleton
// should resemble final layout" and "avoid layout jumping".

export const CarCardSkeleton: React.FC = () => (
  <View style={styles.cardWrap}>
    <SkeletonBlock height={170} radius={radii.lg} />
    <View style={{ padding: spacing.md }}>
      <SkeletonBlock width="70%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="40%" height={12} style={{ marginBottom: 10 }} />
      <SkeletonBlock width="55%" height={12} style={{ marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock width={70} height={18} />
        <SkeletonBlock width={32} height={32} radius={16} />
      </View>
    </View>
  </View>
);

// Mirrors HomeScreen's header -> search bar -> category row -> card list.
export const HomeSkeleton: React.FC<{ topInset: number }> = ({ topInset }) => (
  <View style={{ paddingTop: topInset + spacing.sm, paddingHorizontal: spacing.lg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
      <SkeletonBlock width={44} height={44} radius={22} />
      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
        <SkeletonBlock width="50%" height={12} style={{ marginBottom: 6 }} />
        <SkeletonBlock width="35%" height={16} />
      </View>
      <SkeletonBlock width={40} height={40} radius={20} />
    </View>
    <SkeletonBlock height={50} radius={radii.lg} style={{ marginBottom: spacing.xl }} />
    <View style={{ flexDirection: 'row', marginBottom: spacing.xl }}>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBlock key={i} width={76} height={30} radius={radii.pill} style={{ marginRight: spacing.xs }} />
      ))}
    </View>
    <CarCardSkeleton />
    <CarCardSkeleton />
  </View>
);

// Mirrors CarDetailsScreen's gallery -> title/rating -> spec grid -> pricing.
export const CarDetailsSkeleton: React.FC<{ topInset: number }> = ({ topInset }) => (
  <View>
    <SkeletonBlock height={280} radius={0} />
    <View style={[styles.backButtonOverlay, { top: topInset + spacing.sm }]}>
      <SkeletonBlock width={40} height={40} radius={20} />
    </View>
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
      <SkeletonBlock width="65%" height={24} style={{ marginBottom: 10 }} />
      <SkeletonBlock width="40%" height={14} style={{ marginBottom: 16 }} />
      <SkeletonBlock width="50%" height={14} style={{ marginBottom: 24 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: '33.33%', padding: 4 }}>
            <SkeletonBlock height={64} radius={radii.md} />
          </View>
        ))}
      </View>
      <SkeletonBlock height={90} radius={radii.lg} style={{ marginTop: spacing.md }} />
    </View>
  </View>
);

// Mirrors BookingDetailsScreen's status banner -> trip card -> actions card.
export const BookingDetailsSkeleton: React.FC = () => (
  <View style={{ paddingHorizontal: spacing.lg }}>
    <SkeletonBlock height={64} radius={radii.lg} style={{ marginBottom: spacing.md }} />
    <SkeletonBlock width="30%" height={16} style={{ marginBottom: spacing.sm }} />
    <SkeletonBlock height={210} radius={radii.lg} style={{ marginBottom: spacing.lg }} />
    <SkeletonBlock width="30%" height={16} style={{ marginBottom: spacing.sm }} />
    <SkeletonBlock height={110} radius={radii.lg} />
  </View>
);

// B3 -- mirrors RentalCard's own row layout (see components/RentalCard.tsx:
// fixed-width image on the left, title/status-pill row + id line + dates
// line + total line on the right) so My Rents no longer swaps a generic
// centered spinner for a completely differently-shaped list the instant
// real data arrives -- the same "skeleton resembles final layout" principle
// HomeSkeleton/CarDetailsSkeleton/BookingDetailsSkeleton already follow.
// Includes the screen's own title + tab-pill row so the whole first paint
// (not just the list) is already in its final position.
const TripRowSkeleton: React.FC = () => (
  <View style={styles.tripRow}>
    <SkeletonBlock width={96} height={96} radius={0} style={{ borderRadius: 0 }} />
    <View style={{ flex: 1, padding: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock width="50%" height={16} />
        <SkeletonBlock width={64} height={18} radius={radii.pill} />
      </View>
      <SkeletonBlock width="35%" height={11} style={{ marginTop: 8 }} />
      <SkeletonBlock width="65%" height={13} style={{ marginTop: 8 }} />
      <SkeletonBlock width="30%" height={16} style={{ marginTop: 10 }} />
    </View>
  </View>
);

export const TripsListSkeleton: React.FC<{ topInset: number }> = ({ topInset }) => (
  <View style={{ paddingTop: topInset + spacing.sm, paddingHorizontal: spacing.lg }}>
    <SkeletonBlock width="45%" height={26} style={{ marginBottom: spacing.lg }} />
    <SkeletonBlock height={44} radius={radii.pill} style={{ marginBottom: spacing.lg }} />
    <TripRowSkeleton />
    <TripRowSkeleton />
    <TripRowSkeleton />
  </View>
);

// B3 -- mirrors OwnerDashboardScreen's own header -> gradient earnings hero
// -> tab row -> listing-card layout, for the exact same reason as
// TripsListSkeleton above: the owner's dashboard previously swapped a
// centered spinner for a hero card + listing cards, which is a much bigger
// visual jump than any other loading state in the app.
export const OwnerDashboardSkeleton: React.FC<{ topInset: number }> = ({ topInset }) => (
  <View style={{ paddingTop: topInset + spacing.sm, paddingHorizontal: spacing.lg }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
      <View>
        <SkeletonBlock width={140} height={24} style={{ marginBottom: 8 }} />
        <SkeletonBlock width={180} height={13} />
      </View>
      <SkeletonBlock width={40} height={40} radius={20} />
    </View>
    <SkeletonBlock height={140} radius={radii.lg} style={{ marginBottom: spacing.lg }} />
    <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
      <SkeletonBlock height={40} radius={radii.pill} style={{ flex: 1, marginRight: spacing.xs }} />
      <SkeletonBlock height={40} radius={radii.pill} style={{ flex: 1, marginHorizontal: spacing.xs }} />
      <SkeletonBlock height={40} radius={radii.pill} style={{ flex: 1, marginLeft: spacing.xs }} />
    </View>
    <SkeletonBlock height={190} radius={radii.lg} style={{ marginBottom: spacing.md }} />
    <SkeletonBlock height={190} radius={radii.lg} />
  </View>
);

// Mirrors MessagesScreen's own title -> avatar/name/time/preview row list.
// Added alongside the Owner<->Customer relationship pass, since Messages is
// now a persistent tab for BOTH roles (see MainTabNavigator) and previously
// swapped a centered spinner for a completely differently-shaped list, the
// same jump every other list screen in the app was already fixed for.
const MessageRowSkeleton: React.FC = () => (
  <View style={styles.messageRow}>
    <SkeletonBlock width={52} height={52} radius={radii.md} />
    <View style={{ flex: 1, marginLeft: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SkeletonBlock width="40%" height={15} />
        <SkeletonBlock width={40} height={11} />
      </View>
      <SkeletonBlock width="30%" height={11} style={{ marginTop: 6 }} />
      <SkeletonBlock width="70%" height={13} style={{ marginTop: 6 }} />
    </View>
  </View>
);

export const MessagesListSkeleton: React.FC<{ topInset: number }> = ({ topInset }) => (
  <View style={{ paddingTop: topInset + spacing.sm, paddingHorizontal: spacing.lg }}>
    <SkeletonBlock width="45%" height={26} style={{ marginBottom: spacing.lg }} />
    <MessageRowSkeleton />
    <MessageRowSkeleton />
    <MessageRowSkeleton />
    <MessageRowSkeleton />
  </View>
);

// Mirrors NotificationsScreen's own icon-circle + title/time + message row.
const NotificationRowSkeleton: React.FC = () => (
  <View style={styles.notificationRow}>
    <SkeletonBlock width={40} height={40} radius={20} />
    <View style={{ flex: 1, marginLeft: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width={36} height={11} />
      </View>
      <SkeletonBlock width="85%" height={12} style={{ marginTop: 8 }} />
    </View>
  </View>
);

export const NotificationsListSkeleton: React.FC = () => (
  <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
    <NotificationRowSkeleton />
    <NotificationRowSkeleton />
    <NotificationRowSkeleton />
    <NotificationRowSkeleton />
    <NotificationRowSkeleton />
  </View>
);

// Mirrors OwnerPublicProfileScreen / CustomerProfileScreen's own avatar ->
// name -> meta lines -> About -> (Listed Cars, owner only) layout, so both
// "view the other party" screens in the Owner<->Customer relationship no
// longer swap a centered spinner for a completely differently-shaped page.
export const PublicProfileSkeleton: React.FC<{ showListings?: boolean }> = ({ showListings }) => (
  <View>
    <View style={styles.profileSkeletonCard}>
      <SkeletonBlock width={88} height={88} radius={44} style={{ marginBottom: spacing.sm }} />
      <SkeletonBlock width={140} height={20} style={{ marginBottom: 8 }} />
      <SkeletonBlock width={100} height={13} style={{ marginBottom: 6 }} />
      <SkeletonBlock width={160} height={13} />
    </View>
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
      <SkeletonBlock width="30%" height={16} style={{ marginBottom: spacing.sm }} />
      <SkeletonBlock width="100%" height={13} style={{ marginBottom: 4 }} />
      <SkeletonBlock width="80%" height={13} />
    </View>
    {showListings ? (
      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <SkeletonBlock width="40%" height={16} style={{ marginBottom: spacing.sm }} />
        <SkeletonBlock height={72} radius={radii.lg} style={{ marginBottom: spacing.sm }} />
        <SkeletonBlock height={72} radius={radii.lg} />
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface },
  cardWrap: { backgroundColor: colors.card, borderRadius: radii.lg, marginBottom: spacing.md, overflow: 'hidden' },
  backButtonOverlay: { position: 'absolute', left: spacing.lg },
  messageRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  notificationRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm },
  profileSkeletonCard: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  tripRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
});
