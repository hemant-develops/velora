import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import RazorpayCheckout, { CheckoutOptions, ErrorResponse, SuccessResponse } from 'react-native-razorpay';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

// SUBSCRIPTION MONETIZATION -- "Subscription Active -> Car Listing Active"
// from the product spec. This is the FIRST real (not mocked) payment flow in
// the app: create-subscription-order / verify-subscription-payment (see
// supabase/functions/) are the only things that ever see a Razorpay key, and
// verify-subscription-payment is the only thing that ever writes to
// public.owner_subscriptions -- this screen just orchestrates the three
// steps and reports whatever they say, never assumes success on its own.
export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { user, createSubscriptionOrder, verifySubscriptionPayment } = useAuth();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!user) return null;

  const isActive = user.subscriptionActive === true;

  const onSubscribe = async () => {
    if (purchasing) return;
    setError(undefined);
    setPurchasing(true);
    try {
      const order = await createSubscriptionOrder();
      if (!order.success) {
        setError(order.error);
        return;
      }

      const options: CheckoutOptions = {
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'VELORA',
        description: 'Owner Subscription — 3 months',
        prefill: { email: user.email, contact: user.phone, name: user.name },
        theme: { color: colors.primary },
      };

      let checkoutResult: SuccessResponse;
      try {
        checkoutResult = await RazorpayCheckout.open(options);
      } catch (checkoutErr) {
        // RazorpayCheckout.open rejects both on a real failure AND on the
        // person simply closing the payment sheet themselves -- neither is
        // an app bug, so this is a quiet return, not an error banner.
        const description = (checkoutErr as ErrorResponse)?.description;
        if (description) console.log(`VELORA_SUBSCRIPTION_CHECKOUT_DISMISSED: ${description}`);
        return;
      }

      const result = await verifySubscriptionPayment({
        orderId: checkoutResult.razorpay_order_id,
        paymentId: checkoutResult.razorpay_payment_id,
        signature: checkoutResult.razorpay_signature,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      Alert.alert('Subscription active', 'Your VELORA owner subscription is now active. You can list your car.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Owner Subscription" onBack={() => navigation.goBack()} />

      <View style={{ padding: spacing.lg }}>
        {isActive ? (
          <View style={styles.activeCard}>
            <Ionicons name="shield-checkmark" size={32} color={colors.success} />
            <Text style={styles.activeTitle}>Your subscription is active</Text>
            {user.subscriptionExpiresAt ? (
              <Text style={styles.activeBody}>Valid until {formatDate(user.subscriptionExpiresAt)}. You can list and manage your cars.</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.planCard}>
            <Text style={styles.planLabel}>VELORA OWNER PLAN</Text>
            <Text style={styles.planPrice}>
              {formatCurrency(1)}
              <Text style={styles.planPeriod}> / 3 months</Text>
            </Text>
            <Text style={styles.planNote}>Introductory pricing — subject to change on renewal.</Text>

            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.benefitText}>List and manage your cars in the app</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.benefitText}>A public VELORA store page for your listings</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.benefitText}>Discoverable in VELORA website search &amp; Google</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton
              label={purchasing ? 'Opening payment…' : `Subscribe for ${formatCurrency(1)}`}
              onPress={onSubscribe}
              loading={purchasing}
              disabled={purchasing}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  planCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg },
  planLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', letterSpacing: 0.5 },
  planPrice: { ...typography.headingLg, color: colors.textPrimary, marginTop: spacing.xs },
  planPeriod: { ...typography.bodyMd, color: colors.textSecondary, fontWeight: '400' },
  planNote: { ...typography.caption, color: colors.textTertiary, marginTop: 4, marginBottom: spacing.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  benefitText: { ...typography.bodySm, color: colors.textPrimary, flex: 1 },
  error: { ...typography.bodySm, color: colors.danger, marginTop: spacing.sm },
  activeCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, alignItems: 'center' },
  activeTitle: { ...typography.headingSm, color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' },
  activeBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
