import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useMessages } from '../../context/MessagesContext';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { supabase } from '../../lib/supabase';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ChatMessage, Conversation } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationDetail'>;

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

// One bubble for a recorded voice note. The chat-audio bucket is private, so
// playback needs a fresh signed URL -- fetched lazily on first tap rather
// than for every message up front, since most voice notes in a long thread
// are never actually played.
const VoiceMessageBubble: React.FC<{ path: string; mine: boolean }> = ({ path, mine }) => {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  const onPlay = async () => {
    if (loading || playing) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from('chat-audio').createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        Alert.alert("Couldn't play voice message", 'Please check your connection and try again.');
        return;
      }
      const player = createAudioPlayer(data.signedUrl);
      setPlaying(true);
      player.play();
      // expo-audio doesn't expose a completion callback here without the
      // full status-listener hook API -- clean the native player up after a
      // generous ceiling instead of leaking it indefinitely on this screen.
      setTimeout(() => {
        try {
          player.remove();
        } catch (e) {
          // Already released -- nothing to do.
        }
        setPlaying(false);
      }, 120000);
    } catch (err) {
      Alert.alert("Couldn't play voice message", 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable onPress={onPlay} style={styles.voiceRow} accessibilityLabel="Play voice message">
      {loading ? (
        <ActivityIndicator size="small" color={mine ? colors.primary : colors.textSecondary} />
      ) : (
        <Ionicons name={playing ? 'volume-high' : 'play-circle'} size={22} color={mine ? colors.primary : colors.textSecondary} />
      )}
      <Text style={mine ? styles.bubbleTextMe : styles.bubbleTextThem}>{playing ? 'Playing…' : 'Voice message'}</Text>
    </Pressable>
  );
};

export const ConversationDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getConversation, findConversation, sendMessage, markRead } = useMessages();
  const [conversationId, setConversationId] = useState(route.params.conversationId);
  const rawConversation = conversationId ? getConversation(conversationId) : undefined;
  // Final-verification fix -- getConversation(id) resolves ANY conversation
  // by id with no participant check of its own (it can't know who's asking).
  // Every real entry point only ever passes an id belonging to the current
  // user, but nothing previously stopped a foreign/guessed id from rendering
  // another renter/owner's full message thread here. This is the actual
  // ownership check for "conversation access control".
  const conversation =
    rawConversation && user && (rawConversation.renterId === user.id || rawConversation.ownerId === user.id)
      ? rawConversation
      : undefined;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const voiceRecorder = useVoiceRecorder();

  // A fresh thread (no conversationId yet) happens when either a renter
  // taps "Message Owner" (from Car Details/an owner's profile) or an owner
  // taps "Message Customer" (from Booking Details/a customer's profile) —
  // the conversation isn't created until the first message is actually
  // sent. Either way, show the OTHER party's name/avatar, not always
  // "Owner" — a fresh thread opened by the owner needs the customer's name.
  // Computed here (rather than after the `if (!user) return null;` below)
  // because the chat-unification effect right after it is a hook and needs
  // these values, and hooks can't follow a conditional return.
  const isFreshThread = !conversationId;
  // Every real entry point that opens a fresh (not-yet-created) thread
  // always passes both of these — see Car Details, an owner's/customer's
  // public profile, and Booking Details' message actions. Reading them into
  // local consts (instead of asserting `route.params.carId!` later) means a
  // future call site that forgets one fails safely into the empty state
  // below rather than silently sending a message with `carId: undefined`.
  const { carId: freshCarId, ownerId: freshOwnerId } = route.params;
  // CHAT UNIFICATION -- there's only ever one thread per (renter, owner)
  // pair now (see supabase_migration_multidevice.sql). So if this "fresh"
  // thread's renter/owner pair already has a conversation going (started
  // about a different car), jump straight into that existing thread instead
  // of showing what looks like a blank new one that loses prior history.
  // Mirrors the same renterId fallback onSend uses when actually sending.
  //
  // `findConversation` IS a real dependency, not just the values it reads --
  // MessagesProvider hands out a new closure every time its conversations
  // list changes (see MessagesContext's useMemo). On a cold start this
  // screen can mount before that first fetch resolves; without
  // `findConversation` in the deps below, the effect would run once against
  // an still-empty list, find nothing, and never get a second chance once
  // the real data (and a new findConversation closure) arrives a moment
  // later -- leaving an existing thread's history hidden behind a "Say
  // hello" empty state until the person sent a message themselves.
  useEffect(() => {
    if (!isFreshThread || !user || !freshOwnerId) return;
    const renterId = route.params.renterId ?? user.id;
    const existing = findConversation(renterId, freshOwnerId);
    if (existing) setConversationId(existing.id);
  }, [isFreshThread, user?.id, freshOwnerId, route.params.renterId, findConversation]);

  useEffect(() => {
    // Gated on the ownership-checked `conversation`, not the raw id, so a
    // foreign/guessed conversationId can't be marked read either.
    if (conversation && user) markRead(conversation.id, user.role);
  }, [conversation, user?.role]);

  if (!user) return null;

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
    setSending(true);
    const text = draft.trim();
    setDraft('');

    // MULTI-DEVICE MIGRATION -- sendMessage now writes to Supabase and can
    // genuinely throw (a network hiccup, a race on starting a new thread).
    // Without this try/catch, that throw was an unhandled promise
    // rejection: `sending` never reset (the send button stayed stuck
    // disabled) and the already-cleared draft text was simply lost with no
    // way to recover it. Now a failure restores the draft so nothing typed
    // is lost, and tells the renter/owner plainly so they can retry.
    try {
      let result: Conversation;
      if (conversation) {
        result = await sendMessage({ conversationId: conversation.id, senderId: user.id, senderRole: user.role, text });
      } else {
        if (!freshCarId || !freshOwnerId) {
          // Unreachable in practice — the render guard above already blocks a
          // fresh thread from opening without both ids — but checking here
          // (inside this callback, where the values are actually used) is
          // what lets TypeScript treat them as definite strings below,
          // without a non-null assertion.
          setSending(false);
          return;
        }
        result = await sendMessage({
          senderId: user.id,
          senderRole: user.role,
          text,
          startInfo: {
            carId: freshCarId,
            carName: route.params.carName ?? 'Car',
            // Default to "current user is the renter" — true for every
            // pre-existing entry point (Car Details, an owner's public
            // profile). Booking Details/a customer's profile pass the
            // real renter explicitly instead, since there the current
            // user is the OWNER, not the renter, replying to a customer.
            renterId: route.params.renterId ?? user.id,
            renterName: route.params.renterName ?? user.name,
            renterAvatar: route.params.renterAvatar ?? user.avatar,
            ownerId: freshOwnerId,
            ownerName: route.params.ownerName ?? 'Owner',
            ownerAvatar: route.params.ownerAvatar ?? '',
          },
        });
      }
      setConversationId(result.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_SEND_MESSAGE_FAILED: ${message}`);
      setDraft(text);
      Alert.alert("Couldn't send message", 'Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  // Voice note mic button. Only available once a real conversation exists --
  // a fresh (not-yet-created) thread has no conversationId yet to file the
  // recording's storage path under, and starting one purely from a voice
  // note (skipping the text-based startInfo flow above) isn't a real entry
  // point anywhere in the app today.
  const onMicPress = async () => {
    if (voiceRecorder.state === 'idle') {
      const started = await voiceRecorder.startRecording();
      if (!started) {
        Alert.alert('Microphone access needed', 'Allow microphone access to send a voice message.');
      }
      return;
    }
    if (voiceRecorder.state === 'recording' && conversation) {
      const path = await voiceRecorder.stopAndUpload(conversation.id);
      if (!path) {
        Alert.alert("Couldn't send voice message", 'Please check your connection and try again.');
        return;
      }
      try {
        await sendMessage({
          conversationId: conversation.id,
          senderId: user.id,
          senderRole: user.role,
          text: '🎤 Voice message',
          attachmentUrl: path,
          attachmentType: 'audio',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.log(`VELORA_SEND_VOICE_FAILED: ${message}`);
        Alert.alert("Couldn't send voice message", 'Please check your connection and try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
      <ScreenHeader
        title={partnerName}
        onBack={() => navigation.goBack()}
        style={styles.header}
        right={
          conversation ? (
            <Pressable
              onPress={() => navigation.navigate('Report', { targetKind: 'conversation', targetId: conversation.id, targetLabel: partnerName })}
              accessibilityLabel="Report this conversation"
              hitSlop={8}
            >
              <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        renderItem={({ item }) => {
          const mine = item.senderId === user.id;
          return (
            <View style={[styles.bubbleRow, mine ? styles.bubbleRowMe : undefined]}>
              <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                {item.attachmentType === 'audio' && item.attachmentUrl ? (
                  <VoiceMessageBubble path={item.attachmentUrl} mine={mine} />
                ) : (
                  <Text style={mine ? styles.bubbleTextMe : styles.bubbleTextThem}>{item.text}</Text>
                )}
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
        {voiceRecorder.state === 'recording' ? (
          <>
            <View style={[styles.input, styles.recordingIndicator]}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording…</Text>
            </View>
            <Pressable
              style={[styles.sendBtn, styles.cancelBtn]}
              onPress={voiceRecorder.cancelRecording}
              accessibilityLabel="Cancel recording"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable style={styles.sendBtn} onPress={onMicPress} accessibilityLabel="Stop and send voice message">
              <Ionicons name="send" size={18} color={colors.onPrimary} />
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              onSubmitEditing={onSend}
              editable={voiceRecorder.state === 'idle'}
            />
            {draft.trim().length === 0 && conversation ? (
              <Pressable
                style={styles.sendBtn}
                onPress={onMicPress}
                disabled={voiceRecorder.state === 'uploading'}
                accessibilityLabel="Record a voice message"
              >
                {voiceRecorder.state === 'uploading' ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Ionicons name="mic" size={18} color={colors.onPrimary} />
                )}
              </Pressable>
            ) : (
              <Pressable style={styles.sendBtn} onPress={onSend} accessibilityLabel="Send message">
                <Ionicons name="send" size={18} color={colors.onPrimary} />
              </Pressable>
            )}
          </>
        )}
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
  cancelBtn: { backgroundColor: colors.surface },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger, marginRight: spacing.sm },
  recordingText: { ...typography.bodyMd, color: colors.textPrimary },
  voiceRow: { flexDirection: 'row', alignItems: 'center' },
});
