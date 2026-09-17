import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import * as Location from 'expo-location';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useMessages } from '../../context/MessagesContext';
import { useNotifications } from '../../context/NotificationsContext';
import { supabase } from '../../lib/supabase';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ChatMessage, Conversation } from '../../types';
import { detectOffPlatformContact, OFF_PLATFORM_WARNING_TITLE, OFF_PLATFORM_WARNING_BODY, OffPlatformContactType } from '../../utils/contactDetection';

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

// A one-time, user-chosen location card -- never live/continuous tracking.
// attachmentUrl stores "<lat>,<lng>" (see onShareLocation below). Opens the
// device's own maps app on tap; no in-app map view needed for a single pin.
const LocationMessageBubble: React.FC<{ coords: string; mine: boolean }> = ({ coords, mine }) => {
  const onOpen = () => {
    const [lat, lng] = coords.split(',');
    if (!lat || !lng) return;
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {});
  };
  return (
    <Pressable onPress={onOpen} style={styles.voiceRow} accessibilityLabel="Open shared location in maps">
      <Ionicons name="location" size={22} color={mine ? colors.primary : colors.textSecondary} />
      <Text style={mine ? styles.bubbleTextMe : styles.bubbleTextThem}>View shared location</Text>
    </Pressable>
  );
};

export const ConversationDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getConversation, findConversation, sendMessage, markRead } = useMessages();
  const { getForUser: getNotificationsForUser, markRead: markNotificationRead } = useNotifications();
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
  const [sharingLocation, setSharingLocation] = useState(false);

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

  useEffect(() => {
    // BELL-BADGE FIX -- opening this thread only ever cleared the
    // conversation's own unread state (above), never the matching
    // notifications-table row(s) (see MessagesContext.ts:394's
    // `target: { kind: 'conversation', id }`), so the bell kept showing a
    // message as unread even after the person had already read it here
    // instead of tapping through from the Notifications screen.
    if (!conversation || !user) return;
    getNotificationsForUser(user.id)
      .filter((n) => !n.read && n.target?.kind === 'conversation' && n.target.id === conversation.id)
      .forEach((n) => markNotificationRead(n.id));
  }, [conversation, user?.id]);

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

  const onSend = () => {
    if (!draft.trim() || sending) return;
    const text = draft.trim();
    const flagged = detectOffPlatformContact(text);
    if (flagged) {
      Alert.alert(OFF_PLATFORM_WARNING_TITLE, OFF_PLATFORM_WARNING_BODY, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Anyway', style: 'destructive', onPress: () => performSend(text, flagged) },
      ]);
      return;
    }
    performSend(text, null);
  };

  const performSend = async (text: string, flaggedAs: OffPlatformContactType | null) => {
    setSending(true);
    setDraft('');

    // AUDIT TRAIL -- a message the sender chose to send anyway despite the
    // off-platform-contact warning is auto-filed into the existing
    // `reports` table (same table/RLS ReportScreen already uses) so admin
    // has visibility into commission-bypass attempts. Best-effort: never
    // blocks the actual message send if this fails. Only filed when a real
    // conversation already exists -- a brand-new thread has no id yet at
    // this point.
    if (flaggedAs && conversation) {
      supabase
        .from('reports')
        .insert({
          reporter_id: user.id,
          target_kind: 'conversation',
          target_id: conversation.id,
          target_label: partnerName,
          reason: `off_platform_contact_${flaggedAs}`,
          details: 'Auto-filed: sender chose to send a message flagged as containing contact info after being warned.',
        })
        .then(({ error }) => {
          if (error) console.log(`VELORA_OFF_PLATFORM_REPORT_ERROR: ${error.message}`);
        });
    }

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

  // Location sharing -- one-time, user-initiated, never automatic/live
  // tracking. Only available once a real conversation exists, same
  // constraint the old mic button had (a fresh, not-yet-created thread has
  // no conversationId to attach the message to).
  const onShareLocation = async () => {
    if (!conversation || sharingLocation) return;
    setSharingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location access needed', 'Allow location access to share your current location.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const coords = `${position.coords.latitude},${position.coords.longitude}`;
      await sendMessage({
        conversationId: conversation.id,
        senderId: user.id,
        senderRole: user.role,
        text: '📍 Location shared',
        attachmentUrl: coords,
        attachmentType: 'location',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_SHARE_LOCATION_FAILED: ${message}`);
      Alert.alert("Couldn't share location", 'Please check your connection and try again.');
    } finally {
      setSharingLocation(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
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
                ) : item.attachmentType === 'location' && item.attachmentUrl ? (
                  <LocationMessageBubble coords={item.attachmentUrl} mine={mine} />
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
        {conversation ? (
          <Pressable
            style={styles.locationBtn}
            onPress={onShareLocation}
            disabled={sharingLocation}
            accessibilityLabel="Share your current location"
          >
            {sharingLocation ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
            )}
          </Pressable>
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          onSubmitEditing={onSend}
        />
        <Pressable style={styles.sendBtn} onPress={onSend} disabled={sending} accessibilityLabel="Send message">
          {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="send" size={18} color={colors.onPrimary} />}
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
  locationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  voiceRow: { flexDirection: 'row', alignItems: 'center' },
});
