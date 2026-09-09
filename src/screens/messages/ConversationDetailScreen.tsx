import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useMessages } from '../../context/MessagesContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ChatMessage } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationDetail'>;

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export const ConversationDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getConversation, sendMessage, markRead } = useMessages();
  const [conversationId, setConversationId] = useState(route.params.conversationId);
  const conversation = conversationId ? getConversation(conversationId) : undefined;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (conversationId && user) markRead(conversationId, user.role);
  }, [conversationId, user?.role]);

  if (!user) return null;

  // A fresh thread (no conversationId yet) happens when either a renter
  // taps "Message Owner" (from Car Details/an owner's profile) or an owner
  // taps "Message Customer" (from Booking Details/a customer's profile) —
  // the conversation isn't created until the first message is actually
  // sent. Either way, show the OTHER party's name/avatar, not always
  // "Owner" — a fresh thread opened by the owner needs the customer's name.
  const isFreshThread = !conversationId;
  // Every real entry point that opens a fresh (not-yet-created) thread
  // always passes both of these — see Car Details, an owner's/customer's
  // public profile, and Booking Details' message actions. Reading them into
  // local consts (instead of asserting `route.params.carId!` later) means a
  // future call site that forgets one fails safely into the empty state
  // below rather than silently sending a message with `carId: undefined`.
  const { carId: freshCarId, ownerId: freshOwnerId } = route.params;
  const partnerName = conversation
    ? user.role === 'renter'
      ? conversation.ownerName
      : conversation.renterName
    : user.role === 'renter'
      ? route.params.ownerName ?? 'Owner'
      : route.params.renterName ?? 'Customer';
  const messages: ChatMessage[] = conversation?.messages ?? [];

  if (!isFreshThread && !conversation) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <EmptyState icon="alert-circle-outline" title="Conversation not found" />
      </View>
    );
  }

  if (isFreshThread && (!freshCarId || !freshOwnerId)) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <EmptyState icon="alert-circle-outline" title="Can't start this conversation" subtitle="Missing information needed to start a new message thread." />
      </View>
    );
  }

  const onSend = async () => {
    if (!draft.trim() || sending) return;

    if (conversation) {
      setSending(true);
      const text = draft.trim();
      setDraft('');
      const result = await sendMessage({
        conversationId: conversation.id,
        senderId: user.id,
        senderRole: user.role,
        text,
      });
      setConversationId(result.id);
      setSending(false);
      return;
    }

    const carId = route.params.carId;
    const ownerId = route.params.ownerId;
    if (!carId || !ownerId) return;

    setSending(true);
    const text = draft.trim();
    setDraft('');
    const result = await sendMessage({
      senderId: user.id,
      senderRole: user.role,
      text,
      startInfo: {
        carId,
        carName: route.params.carName ?? 'Car',
        // Default to "current user is the renter" — true for every
        // pre-existing entry point (Car Details, an owner's public
        // profile). Booking Details/a customer's profile pass the
        // real renter explicitly instead, since there the current
        // user is the OWNER, not the renter, replying to a customer.
        renterId: route.params.renterId ?? user.id,
        renterName: route.params.renterName ?? user.name,
        renterAvatar: route.params.renterAvatar ?? user.avatar,
        ownerId,
        ownerName: route.params.ownerName ?? 'Owner',
        ownerAvatar: route.params.ownerAvatar ?? '',
      },
    });
    setConversationId(result.id);
    setSending(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
      <ScreenHeader title={partnerName} onBack={() => navigation.goBack()} style={styles.header} />

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        renderItem={({ item }) => {
          const mine = item.senderId === user.id;
          return (
            <View style={[styles.bubbleRow, mine ? styles.bubbleRowMe : undefined]}>
              <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={mine ? styles.bubbleTextMe : styles.bubbleTextThem}>{item.text}</Text>
              </View>
              <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="chatbubble-ellipses-outline" title="Say hello" subtitle={`Ask ${partnerName} anything before you book.`} />
        }
      />

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          onSubmitEditing={onSend}
        />
        <Pressable style={styles.sendBtn} onPress={onSend} accessibilityLabel="Send message">
          <Ionicons name="send" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  bubbleRow: { marginBottom: spacing.md, alignItems: 'flex-start' },
  bubbleRowMe: { alignItems: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.lg },
  bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: colors.onPrimary, borderBottomRightRadius: 4 },
  bubbleTextThem: { ...typography.bodyMd, color: colors.textPrimary },
  bubbleTextMe: { ...typography.bodyMd, color: colors.white },
  time: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 46,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
