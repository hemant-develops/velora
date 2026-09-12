import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useRewards, WalletTransaction } from '../../context/RewardsContext';
import { formatCurrency, formatDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

// VELORA Credits -- a real, working wallet. Every rupee shown here is the
// actual sum of the transactions below (see RewardsContext.getBalance),
// credited by real events (a referral signup/completion, a support
// adjustment) and spendable for real at checkout (see PaymentScreen's
// "Wallet" method). Nothing on this screen is a static/decorative number.
export const WalletScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { getBalance, getTransactions } = useRewards();

  if (!user) return null;

  const balance = getBalance(user.id);
  const transactions = getTransactions(user.id);

  const renderItem = ({ item }: { item: WalletTransaction }) => {
    const isCredit = item.amount > 0;
    return (
      <View style={styles.txRow}>
        <View style={[styles.txIconWrap, { backgroundColor: isCredit ? colors.successBg : colors.dangerBg }]}>
          <Ionicons name={isCredit ? 'arrow-down' : 'arrow-up'} size={16} color={isCredit ? colors.success : colors.danger} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.txReason}>{item.reason}</Text>
          <Text style={styles.txDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isCredit ? colors.success : colors.danger }]}>
          {isCredit ? '+' : ''}
          {formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="VELORA Credits" onBack={() => navigation.goBack()} />

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.balanceCard, shadows.sm]}
            >
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceValue}>{formatCurrency(balance)}</Text>
              <Text style={styles.balanceNote}>Use it at checkout by choosing "Wallet" as your payment method.</Text>
            </LinearGradient>

            <PrimaryButton
              label="Refer Friends & Earn More"
              onPress={() => navigation.navigate('ReferEarn')}
              icon={<Ionicons name="gift-outline" size={16} color={colors.textPrimary} />}
              variant="outline"
              style={{ marginBottom: spacing.lg }}
            />

            <Text style={styles.sectionTitle}>Transaction History</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title="No transactions yet"
            subtitle="Refer a friend or complete a booking to start earning VELORA Credits."
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  balanceCard: { borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  balanceLabel: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.8 },
  balanceValue: { ...typography.displayMd, color: colors.onPrimary, marginTop: 4 },
  balanceNote: { ...typography.bodySm, color: colors.onPrimary, opacity: 0.85, marginTop: spacing.sm, lineHeight: 18 },
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  txIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txReason: { ...typography.titleMd, color: colors.textPrimary },
  txDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  txAmount: { ...typography.titleMd, fontWeight: '700' },
});
