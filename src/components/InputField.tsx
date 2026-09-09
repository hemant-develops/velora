import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  isPassword?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
}

export const InputField: React.FC<Props> = ({ label, error, isPassword, leftIcon, style, ...rest }) => {
  const [secure, setSecure] = useState(!!isPassword);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputRow, error ? styles.inputRowError : undefined]}>
        {leftIcon ? (
          <Ionicons name={leftIcon} size={18} color={colors.textTertiary} style={{ marginRight: 8 }} />
        ) : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={secure}
          autoCapitalize="none"
          {...rest}
        />
        {isPassword ? (
          <Pressable hitSlop={10} onPress={() => setSecure((s) => !s)} accessibilityLabel="Toggle password visibility">
            <Ionicons name={secure ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 54,
    backgroundColor: colors.surface,
  },
  inputRowError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  input: { flex: 1, ...typography.bodyLg, color: colors.textPrimary, paddingVertical: 0 },
  error: { ...typography.bodySm, color: colors.danger, marginTop: 6 },
});
