import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { useNotifications } from '../../context/NotificationsContext';
import { ProfileMenuItem } from '../../components/ProfileMenuItem';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProfileCompleteBadge } from '../../components/ProfileCompleteBadge';
import { formatCurrency, formatDate } from '../../utils/format';
import { getProfileCompleteness } from '../../utils/profile';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user, logout, switchRole } = useAuth();
  const { getCarsByOwner } = useCars();
  const { getBookingsForCars } = useBookings();
  const { getUnreadCountForUser } = useNotifications();
  const navigation = useAppNavigation();

  if (!user) return null;

  const isOwner = user.role === 'owner';
  const isVerifiedOwner = user.ownerVerification?.status === 'verified';
  const completeness = getProfileCompleteness(user);

  const unreadCount = getUnreadCountForUser(user.id);
  const myCars = isOwner ? getCarsByOwner(user.id) : [];
  const totalEarnings = isOwner
    ? getBookingsForCars(myCars.map((c) => c.id))
        .filter((b) => b.status === 'completed')
        .reduce((sum, b) => sum + b.total, 0)
    : 0;

  const onLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const onToggleRole = () => {
    const nextRole = isOwner ? 'renter' : 'owner';
    Alert.alert(
      isOwner ? 'Switch to Renter Mode' : 'Switch to Owner Mode',
      isOwner
        ? 'You will see your bookings and browse cars to rent.'
        : 'You will be able to list cars and manage incoming booking requests.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            const result = await switchRole(nextRole);
            if (!result.success && result.error) Alert.alert('Cannot switch yet', result.error);
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: tabBarClearance }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.displayMd, { marginBottom: spacing.lg }]}>Profile</Text>

      <View style={[styles.card, shadows.sm]}>
        <Pressable onPress={() => navigation.navigate('EditProfile')} accessibilityLabel="Edit profile photo and details">
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
          <View style={styles.avatarEditBadge}>
            <Ionicons name="pencil" size={11} color={colors.onPrimary} />
          </View>
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={typography.headingSm}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.pillRow}>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{isOwner ? 'Rental Owner' : 'Renter'}</Text>
            </View>
            {completeness.isComplete ? <ProfileCompleteBadge /> : null}
          </View>
        </View>
      </View>

      {!completeness.isComplete ? (
        <Pressable style={styles.incompleteCard} onPress={() => navigation.navigate('EditProfile')}>
          <View style={styles.incompleteIconWrap}>
            <Ionicons name="person-add-outline" size={18} color={colors.warning} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.incompleteTitle}>Complete your profile</Text>
            <Text style={styles.incompleteBody}>
              Add {completeness.missingFields.slice(0, 2).join(' and ')}
              {completeness.missingFields.length > 2 ? ', and more' : ''} so {isOwner ? 'renters' : 'owners'} know who they're dealing with.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phone</Text>
          <Text style={styles.detailValue}>{user.phone ?? 'Not added'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Location</Text>
          <Text style={styles.detailValue}>{user.location || 'Not set'}</Text>
        </View>
        {user.createdAt ? (
          <View style={[styles.detailRow, { marginBottom: 0 }]}>
            <Text style={styles.detailLabel}>Member Since</Text>
            <Text style={styles.detailValue}>{formatDate(user.createdAt)}</Text>
          </View>
        ) : null}
      </View>

      {isOwner ? (
        <View style={styles.bioCard}>
          <Text style={styles.bioLabel}>About</Text>
          <Text style={styles.bioText}>{user.bio?.trim() || 'Add a short bio so renters know who they are booking with.'}</Text>
        </View>
      ) : null}

      {isOwner ? (
        <View style={styles.earningsCard}>
          <View style={styles.earningsIconWrap}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.earningsLabel}>Total Earnings</Text>
            <Text style={styles.earningsValue}>{formatCurrency(totalEarnings)}</Text>
          </View>
          <PrimaryButton
            label="View Earnings"
            onPress={() => navigation.navigate('Main', { screen: 'RentsTab' })}
            variant="dark"
            size="sm"
          />
        </View>
      ) : null}

      {isOwner ? (
        <PrimaryButton
          label="Switch to Renter Mode"
          onPress={onToggleRole}
          variant="outline"
          style={{ marginBottom: spacing.xl }}
        />
      ) : isVerifiedOwner ? (
        <PrimaryButton
          label="Switch to Owner Mode"
          onPress={onToggleRole}
          variant="outline"
          style={{ marginBottom: spacing.xl }}
        />
      ) : (
        <View style={{ marginBottom: spacing.xl }}>
          <PrimaryButton
            label="Become a Rental Owner"
            onPress={() => navigation.navigate('OwnerVerification')}
            variant="outline"
          />
          <Text style={styles.becomeOwnerHint}>
            Verify your details once to start listing your own cars for rent.
          </Text>
        </View>
      )}

      {/* An owner account only ever sees its own profile details and the
          settings below — booking/commerce-only items (My Bookings,
          Favorites, Payment Methods) belong to the renter experience and
          are intentionally left out here so the two roles stay separate. */}
      <View style={styles.menu}>
        <ProfileMenuItem icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
        {!isOwner ? (
          <>
            <ProfileMenuItem
              icon="calendar-outline"
              label="My Bookings"
              onPress={() => navigation.navigate('Main', { screen: 'RentsTab' })}
            />
            <ProfileMenuItem icon="heart-outline" label="Favorites" onPress={() => navigation.navigate('Favorites')} />
            <ProfileMenuItem icon="card-outline" label="Payment Methods" onPress={() => navigation.navigate('PaymentMethods')} />
          </>
        ) : null}
        <ProfileMenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => navigation.navigate('Notifications')}
          badgeCount={unreadCount}
        />
        <ProfileMenuItem icon="shield-checkmark-outline" label="Privacy" onPress={() => navigation.navigate('Legal', { kind: 'privacy' })} />
        <ProfileMenuItem icon="document-text-outline" label="Terms & Conditions" onPress={() => navigation.navigate('Legal', { kind: 'terms' })} />
        <ProfileMenuItem icon="help-circle-outline" label="Help & Support" onPress={() => navigation.navigate('HelpSupport')} />
        <ProfileMenuItem icon="log-out-outline" label="Logout" onPress={onLogout} destructive />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  email: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  pillRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  rolePill: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3, marginRight: spacing.xs },
  roleText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  incompleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  incompleteIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  incompleteTitle: { ...typography.titleMd, color: colors.textPrimary },
  incompleteBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  detailsCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  bioCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  bioLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  bioText: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 20 },
  detailLabel: { ...typography.bodyMd, color: colors.textSecondary },
  detailValue: { ...typography.titleMd, color: colors.textPrimary },
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  earningsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(244,199,40,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsLabel: { ...typography.bodySm, color: 'rgba(255,255,255,0.7)' },
  earningsValue: { ...typography.headingMd, color: colors.primary, marginTop: 2 },
  becomeOwnerHint: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  menu: { borderTopWidth: 1, borderTopColor: colors.borderLight },
});
