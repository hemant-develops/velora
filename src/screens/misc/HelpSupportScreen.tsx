import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

const FAQS = [
  { q: 'How do I cancel a booking?', a: 'Go to My Rents, open the booking, and choose Cancel Booking (up to 24 hours before pickup).' },
  { q: 'What documents do I need?', a: "A valid driver's license and a government ID are required at pickup." },
  { q: 'How do I list my own car?', a: 'Sign up as a Rental Owner or switch roles from your Profile, then use "List a Car".' },
  { q: 'Is a security deposit required?', a: 'Yes, a refundable deposit is held on your card and released after the return inspection.' },
];

export const HelpSupportScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Help & Support" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {FAQS.map((item) => (
          <View key={item.q} style={styles.faqCard}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}

        <View style={styles.contactNote}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.contactNoteText}>
            Have a question about a specific booking? Open it from My Rents and use Message Owner (or Message
            Customer) to reach the other person directly.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.md },
  faqCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  question: { ...typography.titleMd, color: colors.textPrimary },
  answer: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  contactNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  contactNoteText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: spacing.sm, flex: 1, lineHeight: 19 },
});
