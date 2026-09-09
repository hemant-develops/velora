import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentMethods'>;

export const PaymentMethodsScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Payment Methods" onBack={() => navigation.goBack()} />

      <View style={[styles.card, shadows.sm, { marginHorizontal: spacing.lg }]}>
        <View style={styles.cardTopRow}>
          <Ionicons name="card" size={22} color={colors.white} />
          <Text style={styles.cardBrand}>VISA</Text>
        </View>
        <Text style={styles.cardNumber}>•••• •••• •••• 4242</Text>
        <View style={styles.cardBottomRow}>
          <Text style={styles.cardLabel}>Card Holder</Text>
          <Text style={styles.cardLabel}>Expires</Text>
        </View>
        <View style={styles.cardBottomRow}>
          <Text style={styles.cardValue}>Demo Account</Text>
          <Text style={styles.cardValue}>12/29</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <PrimaryButton
          label="Add New Card"
          onPress={() => {}}
          variant="outline"
          disabled
          style={{ marginTop: spacing.lg }}
        />
        <Text style={styles.note}>Demo mode: payment methods are for display only — adding a new card isn't available yet.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.textPrimary, borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  cardBrand: { ...typography.titleLg, color: colors.white },
  cardNumber: { ...typography.headingSm, color: colors.white, letterSpacing: 2, marginBottom: spacing.lg },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { ...typography.caption, color: 'rgba(255,255,255,0.6)' },
  cardValue: { ...typography.bodySm, color: colors.white, marginTop: 2 },
  note: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});
