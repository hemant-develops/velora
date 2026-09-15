import React, { useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useMessages } from '../../context/MessagesContext';
import { EmptyState } from '../../components/EmptyState';
import { MessagesListSkeleton } from '../../components/SkeletonLoader';
import { Conversation } from '../../types';
import { useAppNavigation, useTabBarClearance } from '../../navigation/hooks';

const formatTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const MessagesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { user } = useAuth();
  const { getConversationsForUser, archiveConversation, unarchiveConversation, isLoaded } = useMessages();
  const navigation = useAppNavigation();
  // PHASE 4 -- toggles between the normal inbox (archived conversations
  // hidden) and a dedicated Archived view (only archived ones, with an
  // Unarchive action instead of Archive).
  const [showArchived, setShowArchived] = useState(false);

  if (!user) return null;

  // Conversations are read from Supabase asynchronously — without this
  // gate the list briefly renders as "No messages yet" on every cold start,
  // before any real conversations have had a chance to load in.
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <MessagesListSkeleton topInset={insets.top} />
      </View>
    );
  }

  const isRenter = user.role === 'renter';
  const archivedOf = (c: Conversation) => (isRenter ? c.archivedForRenter : c.archivedForOwner);
  const allForUser = getConversationsForUser(user.id, user.role, { includeArchived: true });
  const archivedCount = allForUser.filter(archivedOf).length;
  const conversations = showArchived ? allForUser.filter(archivedOf) : allForUser.filter((c) => !archivedOf(c));

  const partnerOf = (c: Conversation) => (isRenter ? { name: c.ownerName, avatar: c.ownerAvatar } : { name: c.renterName, avatar: c.renterAvatar });
  const unreadOf = (c: Conversation) => (isRenter ? c.unreadForRenter : c.unreadForOwner);

  const onLongPressRow = (item: Conversation) => {
    const partner = partnerOf(item).name;
    if (showArchived) {
      Alert.alert(partner, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unarchive', onPress: () => unarchiveConversation(item.id, user.role) },
      ]);
    } else {
      Alert.alert(partner, 'Archiving hides this conversation from your inbox only — the other person can still message you, and it reappears here if they do.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', onPress: () => archiveConversation(item.id, user.role) },
      ]);
    }
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: tabBarClearance }}
      data={conversations}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.headerRow}>
          {showArchived ? (
            <Pressable style={styles.backLink} onPress={() => setShowArchived(false)} hitSlop={8}>
              <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              <Text style={styles.headerTitle}>Archived</Text>
            </Pressable>
          ) : (
            <Text style={typography.displayMd}>Messages</Text>
          )}
          {!showArchived && archivedCount > 0 ? (
            <Pressable onPress={() => setShowArchived(true)} hitSlop={8}>
              <Text style={styles.archivedLink}>Archived ({archivedCount})</Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const partner = partnerOf(item);
        const unread = unreadOf(item);
        return (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('ConversationDetail', { conversationId: item.id })}
            onLongPress={() => onLongPressRow(item)}
          >
            <Image source={{ uri: partner.avatar }} style={styles.avatar} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <View style={styles.topRow}>
                <Text style={typography.titleLg} numberOfLines={1}>{partner.name}</Text>
                <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.carName} numberOfLines={1}>{item.carName}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        showArchived ? (
          <EmptyState icon="archive-outline" title="No archived conversations" />
        ) : (
          <EmptyState
            icon="chatbubble-outline"
            title="No messages yet"
            subtitle={
              isRenter
                ? 'Message a car\'s owner from Car Details to ask a question before you book.'
                : 'When a renter messages you about one of your cars, it will show up here.'
            }
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.surface },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { ...typography.bodySm, color: colors.textTertiary, marginLeft: spacing.sm },
  carName: { ...typography.caption, color: colors.textTertiary, marginTop: 1 },
  lastMessage: { ...typography.bodyMd, color: colors.textSecondary, marginTop: 2 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    paddingHorizontal: 6,
  },
  unreadText: { ...typography.caption, color: colors.onPrimary, fontWeight: '700' },
  separator: { height: 1, backgroundColor: colors.borderLight },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    minHeight: 32,
  },
  backLink: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { ...typography.displayMd, marginLeft: 2 },
  archivedLink: { ...typography.bodyMd, color: colors.primaryDark, fontWeight: '600' },
});
