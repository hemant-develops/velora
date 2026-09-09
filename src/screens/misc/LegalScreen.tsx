import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

const CONTENT: Record<'privacy' | 'terms', { title: string; body: string }> = {
  privacy: {
    title: 'Privacy Policy',
    body:
      'VELORA respects your privacy. This demo app stores your account, favorites and bookings locally on your device only — nothing is sent to a server. In a production build, this screen would describe what data is collected, how it is used, and how you can request its deletion.',
  },
  terms: {
    title: 'Terms & Conditions',
    body:
      'By using VELORA you agree to rent responsibly and return vehicles in the condition you received them. Full terms and conditions will be published here before launch.',
  },
};

export const LegalScreen: React.FC<Props> = ({ route, navigation }) => {
  const content = CONTENT[route.params.kind];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={content.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.body}>{content.body}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  body: { ...typography.bodyLg, color: colors.textSecondary, lineHeight: 24 },
});
