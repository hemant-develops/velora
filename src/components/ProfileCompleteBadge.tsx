import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

// Deliberately a different icon/color than the "Verified Owner" KYC badge
// (shield-checkmark, green/success) shown elsewhere -- this badge only means
// "this profile is filled in", not "this identity was verified". Keeping
// them visually distinct avoids implying a real-world guarantee the app
// doesn't actually make. See utils/profile.ts.
export const ProfileCompleteBadge: React.FC = () => (
  <View style={styles.badge}>
    <Ionicons name="checkmark-circle" size={13} color={colors.info} />
    <Text style={styles.text}>Profile Complete</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.infoBg,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { ...typography.caption, color: colors.info, fontWeight: '700' as const, marginLeft: 3 },
});
