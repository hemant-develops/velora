import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import RazorpayCheckout, { CheckoutOptions, ErrorResponse, SuccessResponse } from 'react-native-razorpay';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

interface ActivePlan {
  name: string;
  pricePaise: number;
  durationDays: number;
}

// CONFIGURABLE PRICING (0027_subscription_plans.sql) -- the price/duration
// shown here is read from the database, never hardcoded. Changing the plan
// row later (₹199, ₹499, a longer window, ...) updates this screen with no
// app code change or release needed; the actual amount charged/verified is
// independently re-derived server-side from the same table (see
// create-subscription-order / verify-subscription-payment), so this fetch
// is only ever for display -- it never has to be trusted for anything
// security-relevant.
const useActivePlan = () => {
  const [plan, setPlan] = useState<ActivePlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('subscription_plans')
      .select('name, price_paise, duration_days')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.log(`VELORA_SUBSCRIPTION_PLAN_FETCH_ERROR: ${error.message}`);
        } else if (data) {
          setPlan({ name: data.name, pricePaise: data.price_paise, durationDays: data.duration_days });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { plan, loading };
};

const formatDuration = (days: number): string => {
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  return `${days} days`;
};

// SUBSCRIPTION MONETIZATION -- "Subscription Active -> Car Listing Active"
// from the product spec. This is the FIRST real (not mocked) payment flow in
// the app: create-subscription-order / verify-subscription-payment (see
// supabase/functions/) are the only things that ever see a Razorpay key, and
// verify-subscription-payment is the only thing that ever writes to
// public.owner_subscriptions -- this screen just orchestrates the three
// steps and reports whatever they say, never assumes success on its own.
export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const { user, createSubscriptionOrder, verifySubscriptionPayment } = useAuth();
  const { plan, loading: planLoading } = useActivePlan();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const isTestMode = (process.env.EXPO_PUBLIC_SUBSCRIPTION_MODE ?? '').toLowerCase() === 'test';

  if (!user) return null;

  const isActive = user.subscriptionActive === true;

  const onSubscribe = async () => {
    if (purchasing) return;
    setError(undefined);
    setPurchasing(true);
    try {
      if (isTestMode) {
        const result = await verifySubscriptionPayment({
          orderId: 'TEST_MODE',
          paymentId: 'TEST_MODE',
          signature: 'TEST_MODE',
        });

        if (!result.success) {
          setError(result.error);
          return;
        }

        Alert.alert('Test subscription active', 'This is a controlled test activation for VELORA onboarding. You can now list your car.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

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
        description: plan ? `${plan.name} — ${formatDuration(plan.durationDays)}` : 'Owner Subscription',
        prefill: { email: user.email, contact: user.phone, name: user.name },
        theme: { color: colors.primary },
      };

      let checkoutResult: SuccessResponse;
      try {
        checkoutResult = await RazorpayCheckout.open(options);
      } catch (checkoutErr) {
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
        ) : planLoading ? (
          <View style={styles.planCard}>
            <ActivityIndicator color={colors.primaryDark} />
          </View>
        ) : !plan ? (
          <View style={styles.planCard}>
            <Text style={styles.benefitText}>No subscription plan is available right now. Please try again shortly.</Text>
          </View>
        ) : (
          <View style={styles.planCard}>
            <Text style={styles.planLabel}>{plan.name.toUpperCase()}</Text>
            <Text style={styles.planPrice}>
              {formatCurrency(plan.pricePaise / 100)}
              <Text style={styles.planPeriod}> / {formatDuration(plan.durationDays)}</Text>
            </Text>
            <Text style={styles.planNote}>
              {isTestMode ? 'Test mode enabled — this is a controlled local activation for onboarding and QA.' : 'Introductory pricing — subject to change on renewal.'}
            </Text>

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
              label={purchasing ? 'Opening payment…' : `Subscribe for ${formatCurrency(plan.pricePaise / 100)}`}
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
