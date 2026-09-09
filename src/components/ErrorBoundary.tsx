import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';
import { PrimaryButton } from './PrimaryButton';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Top-level safety net around the whole app: if any screen throws during
// render, this shows a calm recovery screen instead of the app crashing to
// a blank/red native error screen for the end user. It intentionally does
// not log anything itself (React's own dev tooling already reports the
// real error to the console/dev overlay for developers) and never surfaces
// the error message or stack trace in the UI.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            An unexpected error occurred. Your information is safe — tap below to continue.
          </Text>
          <PrimaryButton label="Try Again" onPress={this.handleTryAgain} style={{ marginTop: spacing.lg, minWidth: 200 }} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.headingLg, color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
});
