import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

export const SplashScreen: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.logoCircle}>
      <Ionicons name="car-sport" size={36} color={colors.onPrimary} />
    </View>
    <Text style={styles.brand}>VELORA</Text>
    <Text style={styles.tagline}>Car Rentals, Your Way</Text>
    <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brand: { ...typography.displayLg, color: colors.white },
  tagline: { ...typography.bodyMd, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
});
