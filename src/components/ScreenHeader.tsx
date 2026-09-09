import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import { CircleIconButton } from './CircleIconButton';

interface Props {
  title?: string;
  // Defaults to a plain Back arrow calling this. Pass `onBack` (not a raw
  // navigation object) so this component never needs to know about
  // navigation typing -- every screen already has its own goBack() call.
  onBack: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  // A single right-side accessory (a menu button, "Mark all read", etc.) --
  // most screens don't need one, in which case the header stays visually
  // balanced by reserving the same 40px the back button occupies.
  right?: React.ReactNode;
  style?: ViewStyle;
}

// The single, shared screen header used by every pushed (non-tab-root)
// screen in the app: a Back button, a centered title, and an optional
// right-side accessory. This replaces ~20 nearly-identical hand-rolled
// `View + CircleIconButton + Text + View` header blocks that had started to
// drift in their top padding from screen to screen -- this component now
// owns that padding (insets.top + spacing.sm) once, in one place.
export const ScreenHeader: React.FC<Props> = ({ title, onBack, backLabel = 'Go back', backDisabled, right, style }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }, style]}>
      <CircleIconButton icon="arrow-back" onPress={onBack} accessibilityLabel={backLabel} background={colors.surface} disabled={backDisabled} />
      {title ? (
        <Text style={typography.headingSm} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View />
      )}
      <View style={styles.right}>{right}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  right: { width: 40, alignItems: 'flex-end' },
});
