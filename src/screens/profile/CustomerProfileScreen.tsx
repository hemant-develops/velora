import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProfileCompleteBadge } from '../../components/ProfileCompleteBadge';
import { PublicProfileSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { usePublicProfile } from '../../hooks/usePublicProfile';
import { formatDate } from '../../utils/format';
import { getProfileCompleteness } from '../../utils/profile';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerProfile'>;

// A read-only view of the RENTER who booked one of the owner's cars —
// reached from Booking Details or a booking card's "View Customer Profile".
// Deliberately the mirror image of OwnerPublicProfileScreen but without a
// "Listed Cars" section (a renter doesn't list cars), and only ever shows
// public-safe fields already present on AppUser — never anything not
// already visible elsewhere in the app for this exact relationship.
export const CustomerProfileScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user: currentUser } = useAuth();
  const { userId, carId, carName } = route.params;
  const isSelf = currentUser?.id === userId;
  // Final non-payment hardening -- TARGET 1: resolves the real customer via
  // the public-safe RPC (profiles_select_own still blocks a direct lookup
  // of anyone but yourself, unchanged).
  const { profile: customer, isLoading: customerLoading } = usePublicProfile(isSelf ? undefined : userId);

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

  if (customerLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Customer Profile" onBack={() => navigation.goBack()} />
        <PublicProfileSkeleton />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Profile not found" />
      </View>
    );
  }

  // Messaging is car-scoped in this app's existing data model (every
  // Conversation belongs to one specific car) — only offer "Message User"
  // when we actually have the car this profile was reached through.
  const canMessage = !!carId;

  const onMessageUser = () => {
    if (!currentUser || !carId) return;
    navigation.navigate('ConversationDetail', {
      carId,
      carName: carName ?? 'Car',
      renterId: customer.id,
      renterName: customer.name,
      renterAvatar: customer.avatar,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      ownerAvatar: currentUser.avatar,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Customer Profile" onBack={() => navigation.goBack()} />

      <View style={styles.profileCard}>
        <Image source={{ uri: customer.avatar }} style={styles.avatar} />
        <Text style={typography.headingMd}>{customer.name}</Text>
        {customer.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{customer.location}</Text>
          </View>
        ) : null}
        {customer.createdAt ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>Member since {formatDate(customer.createdAt)}</Text>
          </View>
        ) : null}
        {getProfileCompleteness(customer).isComplete ? (
          <View style={{ marginTop: 6 }}>
            <ProfileCompleteBadge />
          </View>
        ) : null}
      </View>

      {customer.bio?.trim() ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bodyText}>{customer.bio.trim()}</Text>
        </View>
      ) : null}

      {canMessage ? (
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <PrimaryButton
            label="Message User"
            onPress={onMessageUser}
            icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onPrimary} />}
          />
        </View>
      ) : null}

      <Pressable
        style={styles.reportRow}
        onPress={() => navigation.navigate('Report', { targetKind: 'user', targetId: customer.id, targetLabel: customer.name })}
        hitSlop={6}
      >
        <Ionicons name="flag-outline" size={15} color={colors.textTertiary} />
        <Text style={styles.reportRowText}>Report this user</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface, marginBottom: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  bodyText: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 21 },
  reportRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.xs },
  reportRowText: { ...typography.bodySm, color: colors.textTertiary, marginLeft: 6 },
});
