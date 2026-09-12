import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { VELORA_OFFERS } from '../../utils/offers';

type Props = NativeStackScreenProps<RootStackParamList, 'Offers'>;

// VELORA's own real, working promo codes -- see utils/offers.ts. Every code
// listed here is checked and applied for real in BookingScreen's Price
// Details section; there is no fabricated third-party/bank cashback offer
// here (VELORA has no payment-partner relationships to base one on).
export const OffersScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Offers" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Enter any of these codes in Promo Code on the booking screen before you pay.
        </Text>
        {VELORA_OFFERS.map((offer) => (
          <View key={offer.code} style={[styles.card, shadows.sm]}>
            <View style={styles.iconWrap}>
              <Ionicons name="pricetag" size={20} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.title}>{offer.title}</Text>
              <Text style={styles.description}>{offer.description}</Text>
              <View style={styles.codePill}>
                <Text style={styles.codeText} selectable>
                  {offer.code}
                </Text>
              </View>
            </View>
          </View>
        ))}
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
