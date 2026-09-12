import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { FAQAccordion } from '../../components/FAQAccordion';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { SUPPORT_EMAIL } from '../../utils/policy';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

// Support inbox for VELORA. There's no ticketing table/backend behind this --
// per the explicit "do NOT invent fake ticket data" direction, this does NOT
// pretend to show ticket status or a support inbox history. Instead it wires
// up a form that actually delivers: it hands the device's mail client a
// pre-filled message addressed to this inbox via Linking.openURL('mailto:'),
// the same real mechanism any "Contact Us" button uses when a project has no
// dedicated backend yet. SUPPORT_EMAIL lives in utils/policy.ts so this form
// and the Terms/Privacy pages can never point at two different addresses.

const FAQS = [
  { question: 'How do I cancel a booking?', answer: 'Go to My Rents, open the booking, and choose Cancel Booking (up to 24 hours before pickup for a full refund).' },
  { question: 'What documents do I need?', answer: "A valid driver's license and a government ID are required at pickup." },
  { question: 'How do I list my own car?', answer: 'Sign up as a Rental Owner or switch roles from your Profile, then use "List a Car".' },
  { question: 'Is a security deposit required?', answer: 'VELORA is currently running in demo payment mode, so no card-based deposit is charged through the app. If a deposit is needed, agree on it directly with the owner before pickup.' },
  { question: 'How do I talk to the owner or renter on a booking?', answer: 'Open the booking from My Rents (or Listings, for owners) and use Message Owner / Message Customer. Every conversation is also visible from the Messages tab.' },
  { question: 'What if the owner or renter is unresponsive?', answer: 'If you can\'t reach the other person about an active or upcoming trip, use "Contact Support" below or the Report option on the booking, listing, or conversation.' },
  { question: 'How do I report a problem with a booking, listing, or person?', answer: 'Use the flag/Report option on the car listing, the person\'s profile, the conversation, or from a booking\'s detail screen ("Report an Issue"). Our team reviews every report.' },
  { question: 'Is my payment or contact info safe?', answer: 'Contact details are only ever shared between a renter and owner once a conversation or booking connects them, and payments never need to leave the app.' },
];

const SAFETY_TIPS = [
  { question: 'Verify ID at pickup', answer: "Always check the other person's ID matches their in-app profile name and photo before handing over keys or getting in the car." },
  { question: 'Inspect the vehicle first', answer: 'Walk around the car and take photos of any existing damage before you drive off, and again when you return it.' },
  { question: 'Never pay outside the app', answer: "Keep all payments inside VELORA. Don't wire money, pay cash upfront, or send payment through a separate app." },
  { question: 'Meet in safe, public locations', answer: 'Prefer well-lit, public pickup/drop-off spots, especially for a first-time meeting with someone new.' },
  { question: 'Report anything that feels off', answer: 'Use the Report option on a listing, a profile, a conversation, or a booking if something seems suspicious, inaccurate, or unsafe.' },
];

export const HelpSupportScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [query]);

  const onSendToSupport = async () => {
    if (!message.trim()) {
      Alert.alert('Add a message', 'Let us know what you need help with before sending.');
      return;
    }
    const mailSubject = subject.trim() || 'VELORA Support Request';
    const bodyLines = [
      message.trim(),
      '',
      '---',
      user ? `From: ${user.name} (${user.email})` : undefined,
      user ? `Account role: ${user.role === 'owner' ? 'Rental Owner' : 'Renter'}` : undefined,
    ].filter(Boolean);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('No email app found', `Please email us directly at ${SUPPORT_EMAIL}.`);
        return;
      }
      await Linking.openURL(url);
      setSubject('');
      setMessage('');
    } catch {
      Alert.alert('Couldn\'t open email', `Please email us directly at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Help & Support" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {/* Contact Support -- the one real, working escalation channel that
            exists independent of any specific booking. A booking-specific
            issue has its own, more specific entry point ("Report an Issue")
            on that booking's detail screen. */}
        <Text style={styles.sectionTitle}>Contact Support</Text>
        <View style={[styles.contactCard, shadows.sm]}>
          <Text style={styles.contactIntro}>
            Can't find your answer below? Send our team a message and we'll get back to you by email.
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject (optional)"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tell us what's going on..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, styles.inputMultiline]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <PrimaryButton
            label="Send to Support"
            onPress={onSendToSupport}
            icon={<Ionicons name="mail-outline" size={16} color={colors.onPrimary} />}
            style={{ marginTop: spacing.sm }}
          />
          <Text style={styles.contactFooter}>Opens your email app, addressed to {SUPPORT_EMAIL}.</Text>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search FAQs..."
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Frequently Asked Questions</Text>
        {filteredFaqs.length > 0 ? (
          <FAQAccordion items={filteredFaqs} />
        ) : (
          <Text style={styles.noResults}>No FAQs match "{query}" -- try Contact Support above.</Text>
        )}

        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Safety Tips</Text>
        <FAQAccordion items={SAFETY_TIPS} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.md },
  contactCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  contactIntro: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyMd,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  inputMultiline: { minHeight: 90 },
  contactFooter: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, marginLeft: 8, ...typography.bodyMd, color: colors.textPrimary, paddingVertical: 0 },
  noResults: { ...typography.bodySm, color: colors.textSecondary, padding: spacing.md },
});
