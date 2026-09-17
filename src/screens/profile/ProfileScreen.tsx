import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useBookings } from '../../context/BookingsContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useRewards } from '../../context/RewardsContext';
import { ProfileMenuItem } from '../../components/ProfileMenuItem';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProfileCompleteBadge } from '../../components/ProfileCompleteBadge';
import { formatCurrency, formatDate } from '../../utils/format';
import { getProfileCompleteness } from '../../utils/profile';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';
import { checkForAppUpdateManually } from '../../hooks/useAppUpdatePrompt';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user, logout, switchRole, deactivateAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const { getCarsByOwner } = useCars();
  const { getBookingsForCars, resetLocalBookingsForTesting } = useBookings();
  const { getUnreadCountForUser } = useNotifications();
  const { getBalance } = useRewards();
  const navigation = useAppNavigation();
  // Manual counterpart to useAppUpdatePrompt's automatic on-open check --
  // requested so a person can trigger the OTA update check on demand (e.g.
  // right after being told a new version was published) instead of only
  // ever getting checked once, silently, at cold start. Runs the same
  // checkForUpdateAsync() call; if it finds something, UpdateBanner
  // (mounted once at the app root) shows the actual download/restart flow
  // on its own -- this handler only needs to speak up for the two outcomes
  // the banner never covers: "you're already up to date" and "the check
  // itself failed" -- so a tap never looks like it did nothing.
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  if (!user) return null;

  const onCheckForUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const result = await checkForAppUpdateManually();
      if (!result.ok) {
        Alert.alert("Couldn't check for updates", result.message ?? 'Please try again.');
      } else if (!result.available) {
        Alert.alert("You're up to date", 'VELORA is already on the latest version.');
      }
      // If an update was found, UpdateBanner reacts to it on its own --
      // nothing else to do here.
    } finally {
      setCheckingUpdate(false);
    }
  };

  const walletBalance = getBalance(user.id);
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

  // Real, working account-deletion entry point (not a decorative screen):
  // calls deactivate_own_account() (0023_account_deletion.sql), which marks
  // the account deleted server-side -- AuthContext.loadUserFromSession then
  // force-signs-out this same account on any future login attempt, closing
  // the confirmed "deleted account can just log back in" bug -- then signs
  // this device out. A full "erase every row from the database" action still
  // needs a privileged server-side call this app doesn't have (see the
  // support-email fallback in utils/policy.ts's Privacy Policy text), so
  // that channel stays available for anyone who wants that too.
  const onDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      'Delete Account',
      'This deletes your VELORA account -- you will be signed out and this email will no longer be able to log in. This cannot be undone from the app. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const result = await deactivateAccount();
            setDeleting(false);
            if (!result.success) {
              Alert.alert("Couldn't delete account", result.error ?? 'Please try again.');
            }
          },
        },
      ],
    );
  };

  // DEV-ONLY -- lets a developer clear out old test bookings (see
  // BookingsContext.resetLocalBookingsForTesting) without needing any
  // database tool, e.g. when a test car appears permanently "fully booked"
  // purely because of leftover bookings from earlier manual testing, not a
  // real availability bug. resetLocalBookingsForTesting only ever exists
  // on the context value when __DEV__ is true, so this whole block renders
  // nothing at all in a production/release build -- it's tucked into the
  // very bottom of Profile as a small, muted, easy-to-ignore row rather
  // than a floating control shown on every screen.
  // MULTI-DEVICE MIGRATION -- bookings are no longer local-only, so this
  // copy was corrected: it now deletes real rows from the shared Supabase
  // `bookings` table (only this account's OWN bookings made as a renter --
  // RLS's bookings_delete policy makes it impossible to delete a booking
  // someone else made on your car listing), not "local device" data.
  const onDevResetBookings = () => {
    Alert.alert(
      'Reset your test bookings?',
      "Developer-only: permanently deletes every booking YOU made as a renter, from Supabase. It won't touch bookings other test accounts made on your car listings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetLocalBookingsForTesting?.().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.log(`VELORA_DEV_BOOKING_RESET_FAILED: ${message}`);
            });
          },
        },
      ],
    );
  };

  const onToggleRole = () => {
    const nextRole = isOwner ? 'renter' : 'owner';
    Alert.alert(
      isOwner ? 'Switch to Customer Mode' : 'Switch to Car Owner Mode',
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
              <Text style={styles.roleText}>{isOwner ? 'Car Owner' : 'Customer'}</Text>
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
          label="Switch to Customer Mode"
          onPress={onToggleRole}
          variant="outline"
          style={{ marginBottom: spacing.xl }}
        />
      ) : isVerifiedOwner ? (
        <PrimaryButton
          label="Switch to Car Owner Mode"
          onPress={onToggleRole}
          variant="outline"
          style={{ marginBottom: spacing.xl }}
        />
      ) : (
        // B3.5 -- elevated from a plain outline button + caption into a
        // proper promotional banner, since this is VELORA's one real
        // "supply side" entry point (become an owner). Deliberately no
        // invented earnings figure ("earn up to ₹X/month") -- VELORA has no
        // real basis for a number like that, unlike the marketplace
        // pattern this was inspired by, so the copy stays honest and
        // generic while still getting the same visual prominence.
        <Pressable
          onPress={() => navigation.navigate('OwnerVerification')}
          style={{ marginBottom: spacing.xl }}
          accessibilityRole="button"
          accessibilityLabel="Become a car owner"
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.ownerBanner, shadows.sm]}
          >
            <View style={styles.ownerBannerIconWrap}>
              <Ionicons name="car-sport" size={22} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.ownerBannerTitle}>Have a car sitting idle?</Text>
              <Text style={styles.ownerBannerBody}>List it on VELORA and start earning from bookings.</Text>
              <Text style={styles.ownerBannerCta}>Get Started</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
          </LinearGradient>
        </Pressable>
      )}

      {/* VELORA Credits -- a real wallet balance (RewardsContext), shown for
          both roles since either can earn credits via Refer & Earn and
          either can spend them at checkout as a renter. */}
      <Pressable style={[styles.walletCard, shadows.sm]} onPress={() => navigation.navigate('Wallet')}>
        <View style={styles.walletIconWrap}>
          <Ionicons name="wallet-outline" size={20} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.walletLabel}>VELORA Credits</Text>
          <Text style={styles.walletValue}>{formatCurrency(walletBalance)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>

      {/* An owner account only ever sees its own profile details and the
          settings below — booking/commerce-only items (My Bookings,
          Favorites, Payment Methods) belong to the renter experience and
          are intentionally left out here so the two roles stay separate. */}
      <View style={styles.menu}>
        <ProfileMenuItem icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
        <ProfileMenuItem icon="gift-outline" label="Refer & Earn" onPress={() => navigation.navigate('ReferEarn')} />
        {!isOwner ? (
          <>
            <ProfileMenuItem
              icon="calendar-outline"
              label="My Bookings"
              onPress={() => navigation.navigate('Main', { screen: 'RentsTab' })}
            />
            <ProfileMenuItem icon="heart-outline" label="Favorites" onPress={() => navigation.navigate('Favorites')} />
            <ProfileMenuItem icon="card-outline" label="Payment Methods" onPress={() => navigation.navigate('PaymentMethods')} />
            <ProfileMenuItem icon="pricetag-outline" label="Offers" onPress={() => navigation.navigate('Offers')} />
          </>
        ) : null}
        <ProfileMenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => navigation.navigate('Notifications')}
          badgeCount={unreadCount}
        />
        <ProfileMenuItem
          icon="call-outline"
          label="Phone Verification"
          subtitle={user.phoneVerification?.verified ? 'Verified' : 'Not verified yet'}
          onPress={() => navigation.navigate('PhoneVerification')}
        />
        {isOwner ? (
          <ProfileMenuItem
            icon="ribbon-outline"
            label="Owner Subscription"
            subtitle={user.subscriptionActive ? 'Active' : 'Inactive — subscribe to list cars'}
            onPress={() => navigation.navigate('Subscription')}
          />
        ) : null}
        <ProfileMenuItem icon="shield-checkmark-outline" label="Privacy" onPress={() => navigation.navigate('Legal', { kind: 'privacy' })} />
        <ProfileMenuItem icon="document-text-outline" label="Terms & Conditions" onPress={() => navigation.navigate('Legal', { kind: 'terms' })} />
        <ProfileMenuItem icon="help-circle-outline" label="Help & Support" onPress={() => navigation.navigate('HelpSupport')} />
        <ProfileMenuItem
          icon="cloud-download-outline"
          label="Check for Updates"
          subtitle={checkingUpdate ? 'Checking…' : undefined}
          onPress={onCheckForUpdates}
        />
        <ProfileMenuItem icon="log-out-outline" label="Logout" onPress={onLogout} destructive />
        <ProfileMenuItem
          icon="trash-outline"
          label={deleting ? 'Deleting…' : 'Delete Account'}
          onPress={onDeleteAccount}
          destructive
        />
      </View>

      {__DEV__ && resetLocalBookingsForTesting ? (
        <Pressable onPress={onDevResetBookings} style={styles.devRow} hitSlop={8}>
          <Ionicons name="bug-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.devRowText}>Developer: Reset My Test Bookings</Text>
        </Pressable>
      ) : null}
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
  ownerBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.lg, padding: spacing.md },
  ownerBannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(26,26,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerBannerTitle: { ...typography.titleLg, color: colors.onPrimary },
  ownerBannerBody: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.85, marginTop: 2, lineHeight: 18 },
  ownerBannerCta: { ...typography.bodySm, color: colors.onPrimary, fontWeight: '700', marginTop: 6 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  walletIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(244,199,40,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLabel: { ...typography.bodySm, color: colors.textSecondary },
  walletValue: { ...typography.headingSm, color: colors.textPrimary, marginTop: 2 },
  menu: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  devRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  devRowText: { ...typography.caption, color: colors.textTertiary, marginLeft: 6 },
});
