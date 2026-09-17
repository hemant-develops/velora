import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { NotificationsListSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { AppNotification, NotificationType } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  booking_created: 'calendar-outline',
  booking_status: 'car-sport-outline',
  message: 'chatbubble-ellipses-outline',
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { isLoaded, getForUser, getUnreadCountForUser, markRead, markAllReadForUser } = useNotifications();

  if (!user) return null;

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
        <NotificationsListSkeleton />
      </View>
    );
  }

  const items = getForUser(user.id);
  const unreadCount = getUnreadCountForUser(user.id);

  const onPressItem = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.target?.kind === 'booking') {
      navigation.navigate('BookingDetails', { bookingId: n.target.id });
    } else if (n.target?.kind === 'car') {
      navigation.navigate('CarDetails', { carId: n.target.id });
    } else if (n.target?.kind === 'conversation') {
      navigation.navigate('ConversationDetail', { conversationId: n.target.id });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.headerActions}>
            {unreadCount > 0 ? (
              <Pressable onPress={() => markAllReadForUser(user.id)} hitSlop={8} accessibilityLabel="Mark all as read">
                <Ionicons name="checkmark-done" size={22} color={colors.primaryDark} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => navigation.navigate('NotificationSettings')} hitSlop={8} accessibilityLabel="Notification settings">
              <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        }
      />

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onPressItem(item)}>
            <View style={[styles.iconCircle, !item.read ? styles.iconCircleUnread : undefined]}>
              <Ionicons name={TYPE_ICON[item.type]} size={18} color={!item.read ? colors.onPrimary : colors.textSecondary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <View style={styles.topRow}>
                <Text style={[typography.titleMd, !item.read ? styles.titleUnread : undefined]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
              {item.read ? (
                <View style={styles.seenRow}>
                  <Ionicons name="checkmark-done" size={13} color={colors.textTertiary} />
                  <Text style={styles.seenText}>Seen</Text>
                </View>
              ) : null}
            </View>
            {!item.read ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No notifications yet"
            subtitle={
              user.role === 'owner'
                ? "You'll see booking requests and messages from renters here."
                : "You'll see booking updates and messages from owners here."
            }
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconCircleUnread: { backgroundColor: colors.onPrimary },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleUnread: { fontWeight: '700' },
  time: { ...typography.bodySm, color: colors.textTertiary, marginLeft: spacing.sm },
  message: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  seenRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  seenText: { ...typography.caption, color: colors.textTertiary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: spacing.sm, marginTop: 6 },
  separator: { height: 1, backgroundColor: colors.borderLight },
});
