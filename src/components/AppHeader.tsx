import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';
import { AppUser } from '../types';

interface Props {
  user: AppUser;
  onPressNotifications?: () => void;
  onPressAvatar?: () => void;
  onPressLocation?: () => void;
  hasUnreadNotifications?: boolean;
}

export const AppHeader: React.FC<Props> = ({ user, onPressNotifications, onPressAvatar, onPressLocation, hasUnreadNotifications }) => (
  <View style={styles.row}>
    <View style={styles.left}>
      <Pressable onPress={onPressAvatar} accessibilityLabel="Open profile">
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
      </Pressable>
      <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
        <Text style={typography.headingSm}>{user.name}</Text>
        <Pressable style={styles.locationRow} onPress={onPressLocation} hitSlop={6} accessibilityLabel="Change location">
          <Ionicons name="location-sharp" size={13} color={user.location ? colors.textSecondary : colors.primaryDark} />
          <Text style={[styles.locationText, !user.location ? styles.locationTextPrompt : undefined]} numberOfLines={1}>
            {user.location || 'Set your location'}
          </Text>
          {onPressLocation ? <Ionicons name="chevron-down" size={12} color={colors.textTertiary} style={{ marginLeft: 2 }} /> : null}
        </Pressable>
      </View>
    </View>
    <Pressable style={styles.bell} onPress={onPressNotifications} accessibilityLabel="Notifications">
      <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
      {hasUnreadNotifications ? <View style={styles.dot} /> : null}
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flex: 1, marginRight: spacing.sm },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  locationText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: 3 },
  locationTextPrompt: { color: colors.primaryDark, fontWeight: '600' },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.surface,
  },
});
