import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  message?: string;
}

// Shown while a screen's data is still being read from storage on cold
// start, so a genuinely empty result (e.g. "No cars found") never gets
// shown before the real data has had a chance to load in. Pair with a
// context's `isLoaded` flag (see CarsContext / MessagesContext).
export const LoadingState: React.FC<Props> = ({ message = 'Loading...' }) => (
  <View style={styles.container}>
    <ActivityIndicator color={colors.primary} />
    <Text style={styles.message}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl },
  message: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.sm },
});
