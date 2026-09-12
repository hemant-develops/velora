import React from 'react';
import { FlatList, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useRewards, ReferralUse, REFERRAL_SIGNUP_BONUS, REFERRAL_COMPLETED_BONUS } from '../../context/RewardsContext';
import { formatCurrency, formatDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferEarn'>;

// Refer & Earn -- a real referral system (see RewardsContext). The code
// shown is a real, unique code generated once per user and stored on
// device; a friend who enters it at signup gets a real signup bonus
// immediately, and this user gets a real bonus the moment that friend's
// first booking is marked completed (watched reactively against the app's
// own real BookingsContext data -- see RewardsContext's effect). Nothing
// below is a placeholder count.
export const ReferEarnScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { getOrCreateMyCode, getReferralsForUser } = useRewards();

  if (!user) return null;

  const myCode = getOrCreateMyCode(user.id);
  const referrals = getReferralsForUser(user.id);
  const completedCount = referrals.filter((r) => r.status === 'completed').length;
  const pendingCount = referrals.length - completedCount;

  const onShare = async () => {
    try {
      await Share.share({
        message: `Join me on VELORA! Use my referral code ${myCode} when you sign up and get ${formatCurrency(REFERRAL_SIGNUP_BONUS)} in VELORA Credits.`,
      });
    } catch {
      // Share sheet dismissed/unavailable -- nothing to recover from, the
      // code is still visible on screen to copy manually.
    }
  };

  const renderItem = ({ item }: { item: ReferralUse }) => (
    <View style={styles.refRow}>
      <View style={[styles.refIconWrap, { backgroundColor: item.status === 'completed' ? colors.successBg : colors.warningBg }]}>
        <Ionicons
          name={item.status === 'completed' ? 'checkmark-circle' : 'time-outline'}
          size={16}
          color={item.status === 'completed' ? colors.success : colors.warning}
        />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.refName}>{item.referredName}</Text>
        <Text style={styles.refDate}>Joined {formatDate(item.createdAt)}</Text>
      </View>
      <Text style={[styles.refStatus, { color: item.status === 'completed' ? colors.success : colors.warning }]}>
        {item.status === 'completed' ? `+${formatCurrency(REFERRAL_COMPLETED_BONUS)}` : 'Pending trip'}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Refer & Earn" onBack={() => navigation.goBack()} />

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.codeCard, shadows.sm]}
            >
              <Text style={styles.codeLabel}>Your Referral Code</Text>
              <Text style={styles.codeValue} selectable>{myCode}</Text>
              <Text style={styles.codeNote}>
                Friends get {formatCurrency(REFERRAL_SIGNUP_BONUS)} on signup. You get {formatCurrency(REFERRAL_COMPLETED_BONUS)} when
                their first trip is completed.
              </Text>
            </LinearGradient>

            <PrimaryButton
              label="Share My Code"
              onPress={onShare}
              icon={<Ionicons name="share-social-outline" size={16} color={colors.onPrimary} />}
              style={{ marginBottom: spacing.lg }}
            />

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{completedCount}</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{pendingCount}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Your Referrals</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No referrals yet"
            subtitle="Share your code above — you'll see friends appear here once they sign up."
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  codeCard: { borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'center' },
  codeLabel: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.8 },
  codeValue: { ...typography.displayMd, color: colors.onPrimary, marginTop: 4, letterSpacing: 2 },
  codeNote: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.85, marginTop: spacing.sm, lineHeight: 18, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginRight: spacing.sm, alignItems: 'center' },
  statValue: { ...typography.headingMd, color: colors.textPrimary },
  statLabel: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  refIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  refName: { ...typography.titleMd, color: colors.textPrimary },
  refDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  refStatus: { ...typography.bodySm, fontWeight: '700' },
});
