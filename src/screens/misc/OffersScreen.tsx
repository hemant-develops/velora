import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Offers'>;

// ADMIN CONNECT -- reads the real, admin-managed public.promo_codes table
// (only active, currently-in-window codes are visible to a non-admin
// session, per 0019_admin_app_connect.sql's promo_codes_select_active
// policy) instead of a hardcoded local list. Every code shown here is the
// same one BookingScreen's Promo Code field validates against, live.
interface PromoCodeRow {
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
}

export const OffersScreen: React.FC<Props> = ({ navigation }) => {
  const [codes, setCodes] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('promo_codes')
      .select('code, discount_type, discount_value')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.log(`VELORA_OFFERS_FETCH_ERROR: ${error.message}`);
          setCodes([]);
        } else {
          setCodes((data ?? []) as PromoCodeRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Offers" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Enter any of these codes in Promo Code on the booking screen before you pay.
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : codes.length === 0 ? (
          <EmptyState icon="pricetag-outline" title="No offers right now" subtitle="Check back soon for new promo codes." />
        ) : (
          codes.map((offer) => (
            <View key={offer.code} style={[styles.card, shadows.sm]}>
              <View style={styles.iconWrap}>
                <Ionicons name="pricetag" size={20} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.title}>
                  {offer.discount_type === 'percent' ? `${offer.discount_value}% off` : `${formatCurrency(offer.discount_value)} off`}
                </Text>
                <Text style={styles.description}>Applies to your booking subtotal.</Text>
                <View style={styles.codePill}>
                  <Text style={styles.codeText} selectable>
                    {offer.code}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
        <Text style={styles.footnote}>Only one promo code can be applied per booking. Codes may be updated or retired at any time.</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  intro: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(244,199,40,0.16)', alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleLg, color: colors.textPrimary },
  description: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  codePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  codeText: { ...typography.titleMd, color: colors.textPrimary, fontWeight: '700', letterSpacing: 1 },
  footnote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
});
