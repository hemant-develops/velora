import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../utils/policy';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

// A single "last updated" stamp for whichever policy is shown -- kept as one
// constant rather than per-section so both documents always agree on when
// they were last reviewed. Update this whenever TERMS_SECTIONS or
// PRIVACY_SECTIONS actually changes.
const LAST_UPDATED = 'September 2026';

const CONTENT: Record<'privacy' | 'terms', { title: string; intro: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    intro:
      "This Privacy Policy explains what information VELORA collects and how it's used. VELORA is a marketplace that only connects vehicle Owners with Renters -- it never asks for more than what's needed to run that marketplace safely.",
    sections: PRIVACY_SECTIONS,
  },
  terms: {
    title: 'Terms & Conditions',
    intro:
      'These Terms govern your use of VELORA. Please read them before listing or booking a vehicle -- they explain what VELORA does (and does not) take responsibility for.',
    sections: TERMS_SECTIONS,
  },
};

export const LegalScreen: React.FC<Props> = ({ route, navigation }) => {
  const content = CONTENT[route.params.kind];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={content.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>
        <Text style={styles.intro}>{content.intro}</Text>

        <View style={styles.docCard}>
          {content.sections.map((section, index) => (
            <View key={section.heading}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  updated: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  intro: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.lg },
  docCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  heading: { ...typography.titleLg, color: colors.textPrimary, marginTop: spacing.sm },
  body: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
});
