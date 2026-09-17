import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';
import { AppUser } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentMethods'>;

// PAYMENT METHODS FIX -- this used to be a fully hardcoded, disconnected
// demo VISA card with a permanently `disabled` "Add Card" button -- not
// connected to anything, and honestly labelled "for display only". VELORA
// has no real payment gateway or card vault anywhere in this app (see
// lib/paymentGateway.ts), so a real "add and save a card" flow isn't
// something this screen can honestly offer yet. What IS real and useful:
// letting a person pick which of PaymentScreen's four actual checkout
// methods should be pre-selected by default, instead of every booking
// always starting on UPI regardless of what they normally use.
const METHODS: { key: NonNullable<AppUser['preferredPaymentMethod']>; label: string; icon: keyof typeof Ionicons.glyphMap; caption: string }[] = [
  { key: 'upi', label: 'UPI', icon: 'flash-outline', caption: 'Google Pay, PhonePe, Paytm' },
  { key: 'card', label: 'Card', icon: 'card-outline', caption: 'Debit / Credit card' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', caption: 'VELORA Wallet balance' },
  { key: 'cash', label: 'Cash / Pay Later', icon: 'cash-outline', caption: 'Pay at pickup' },
];

export const PaymentMethodsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const selected = user?.preferredPaymentMethod ?? 'upi';

  const onSelect = async (key: typeof selected) => {
    if (saving || key === selected) return;
    setSaving(true);
    const ok = await updateProfile({ preferredPaymentMethod: key });
    setSaving(false);
    if (ok) showToast('Default payment method updated');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Payment Methods" onBack={() => navigation.goBack()} />

      <Text style={styles.intro}>
        Choose which payment method is pre-selected when you check out. You can still change it per booking on the
        Payment screen.
      </Text>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {METHODS.map((m) => {
          const isSelected = selected === m.key;
          return (
            <Pressable key={m.key} style={[styles.row, shadows.sm, isSelected ? styles.rowSelected : undefined]} onPress={() => onSelect(m.key)}>
              <View style={[styles.iconWrap, isSelected ? styles.iconWrapSelected : undefined]}>
                <Ionicons name={m.icon} size={20} color={isSelected ? colors.onPrimary : colors.textPrimary} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.rowLabel}>{m.label}</Text>
                <Text style={styles.rowCaption}>{m.caption}</Text>
              </View>
              {isSelected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
        <Text style={styles.note}>VELORA never stores your card, UPI, or bank details — checkout is handled fresh each time.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  intro: { ...typography.bodySm, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowSelected: { borderColor: colors.primary },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconWrapSelected: { backgroundColor: colors.primary },
  rowLabel: { ...typography.titleMd, color: colors.textPrimary },
  rowCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  note: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md, lineHeight: 16 },
});
