import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  background?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const CircleIconButton: React.FC<Props> = ({
  icon,
  onPress,
  color = colors.textPrimary,
  background = colors.white,
  accessibilityLabel,
  disabled,
  style,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={10}
    accessibilityLabel={accessibilityLabel}
    style={[styles.circle, shadows.sm, { backgroundColor: background, opacity: disabled ? 0.5 : 1 }, style]}
  >
    <Ionicons name={icon} size={20} color={color} />
  </Pressable>
);

const styles = StyleSheet.create({
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
