import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, Conversation, UserRole } from '../types';
import { generateId } from '../utils/format';
import { useNotifications } from './NotificationsContext';
import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION -- conversations used to live only in this device's
// AsyncStorage (`velora.conversations.v2`), with every message embedded
// inline inside the conversation record. A renter's message sent from their
// phone would never reach the owner's phone. They now live in two real,
// shared tables (see supabase_migration_multidevice.sql): `public.conversations`
// (the thread header: who, which car, unread counters) and
// `public.chat_messages` (one row per message, referencing its conversation).
// A `velora_bump_conversation_on_message` trigger keeps last_message /
// last_message_at / the unread counters correct server-side, in the same
// transaction as the message insert, so the client no longer has to (and
// can't accidentally desync them across two devices sending at once).

export interface StartConversationInfo {
  carId: string;
  carName: string;
  renterId: string;
  renterName: string;
  renterAvatar: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
}

export interface SendMessageInput {
  conversationId?: string;
  startInfo?: StartConversationInfo;
  senderId: string;
  senderRole: UserRole;
  text: string;
  // Set together for a voice note (legacy, still playable) or a shared
  // location card (new -- see ConversationDetailScreen's location-share
  // button). `text` should still be a short human label ("🎤 Voice
  // message", "📍 Location shared") in either case, not empty, so every
  // existing preview/notification path keeps working as-is.
  attachmentUrl?: string;
  attachmentType?: 'audio' | 'location';
}

interface MessagesContextValue {
  isLoaded: boolean;
  getConversation: (id: string) => Conversation | undefined;
  // PHASE 4 -- excludes conversations archived for `role` by default; pass
  // includeArchived: true (see MessagesScreen's Archived view) to get them
  // back, still scoped to this user.
  getConversationsForUser: (userId: string, role: UserRole, opts?: { includeArchived?: boolean }) => Conversation[];
  // One thread per (renter, owner) pair, regardless of which car it started
  // about -- see the "CHAT UNIFICATION" note in supabase_migration_multidevice.sql.
  findConversation: (renterId: string, ownerId: string) => Conversation | undefined;
  sendMessage: (input: SendMessageInput) => Promise<Conversation>;
  markRead: (conversationId: string, role: UserRole) => void;
  getUnreadCountForUser: (userId: string, role: UserRole) => number;
  // PHASE 4 -- soft-archive/unarchive for exactly ONE side (`role`); the
  // other party's view of this same conversation is completely unaffected.
  // Never deletes a message or the conversation row itself.
  archiveConversation: (conversationId: string, role: UserRole) => Promise<void>;
  unarchiveConversation: (conversationId: string, role: UserRole) => Promise<void>;
  refreshConversations: () => Promise<void>;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

interface ConversationRow {
  id: string;
  car_id: string;
  car_name: string;
  renter_id: string;
  renter_name: string;
  renter_avatar: string;
  owner_id: string;
  owner_name: string;
  owner_avatar: string;
  last_message: string;
  last_message_at: string;
  unread_for_renter: number;
  unread_for_owner: number;
  created_at: string;
  // PHASE 4 -- see supabase/migrations/0005_conversation_archive.sql. Typed
  // as plain `boolean` (the DB column is NOT NULL DEFAULT false once that
  // migration runs), but every read of these two fields in this file still
  // falls back with `?? false` -- belt-and-suspenders for a row fetched
  // before that migration exists, where Supabase simply won't return these
  // keys at all (not `null`, just absent from the object).
  archived_for_renter: boolean;
  archived_for_owner: boolean;
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  attachment_url: string | null;
  attachment_type: string | null;
}

const rowToConversation = (row: ConversationRow, messages: ChatMessage[]): Conversation => ({
  id: row.id,
  carId: row.car_id,
  carName: row.car_name,
  renterId: row.renter_id,
  renterName: row.renter_name,
  renterAvatar: row.renter_avatar,
  ownerId: row.owner_id,
  ownerName: row.owner_name,
  ownerAvatar: row.owner_avatar,
  messages,
  lastMessage: row.last_message,
  lastMessageAt: row.last_message_at,
  unreadForRenter: row.unread_for_renter,
  unreadForOwner: row.unread_for_owner,
  archivedForRenter: row.archived_for_renter ?? false,
  archivedForOwner: row.archived_for_owner ?? false,
});

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversationRows, setConversationRows] = useState<ConversationRow[]>([]);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const { notify } = useNotifications();

  // Guards against a slow fetch resolving after a newer one has already
  // started (e.g. rapid login/logout), which would otherwise clobber fresher
  // data with a stale result.
  const fetchTokenRef = useRef(0);

  const fetchAll = async () => {
    const token = ++fetchTokenRef.current;
    try {
      // RLS scopes both queries to conversations this signed-in user is
      // part of (as renter or owner) -- chat_messages inherits that scoping
      // via its own policy's exists() check against conversations.
      const [convRes, msgRes] = await Promise.all([
        supabase.from('conversations').select('*').order('last_message_at', { ascending: false }),
        supabase.from('chat_messages').select('*').order('created_at', { ascending: true }),
      ]);
      if (fetchTokenRef.current !== token) return; // superseded by a newer fetch

      if (convRes.error) {
        console.log(`VELORA_CONVERSATIONS_FETCH_ERROR: ${convRes.error.message}`);
        return;
      }
      if (msgRes.error) {
        console.log(`VELORA_CHAT_MESSAGES_FETCH_ERROR: ${msgRes.error.message}`);
        return;
      }

      const grouped: Record<string, ChatMessage[]> = {};
      for (const row of (msgRes.data ?? []) as ChatMessageRow[]) {
        const list = grouped[row.conversation_id] ?? (grouped[row.conversation_id] = []);
        list.push({
          id: row.id,
          senderId: row.sender_id,
          text: row.text,
          createdAt: row.created_at,
          attachmentUrl: row.attachment_url ?? undefined,
          attachmentType:
            row.attachment_type === 'audio' ? 'audio' : row.attachment_type === 'location' ? 'location' : undefined,
        });
      }

      setConversationRows((convRes.data ?? []) as ConversationRow[]);
      setMessagesByConv(grouped);
    } finally {
      if (fetchTokenRef.current === token) setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchAll();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchAll();
    });
    // Live updates -- a message sent from the other party's device (or a
    // read-receipt update) appears here without reopening the app.
    const channel = supabase
      .channel('messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => fetchAll())
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const conversations = useMemo<Conversation[]>(
    () =>
      conversationRows
        .map((row) => rowToConversation(row, messagesByConv[row.id] ?? []))
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
    [conversationRows, messagesByConv],
  );

  const findConversation = (renterId: string, ownerId: string) =>
    conversations.find((c) => c.renterId === renterId && c.ownerId === ownerId);

  // A conversation only becomes real -- persisted, and visible to the owner --
  // once the first message is actually sent. Until then it's just context
  // (startInfo) passed along from "Message Owner" on Car Details.
  const sendMessage = async ({
    conversationId,
    startInfo,
    senderId,
    senderRole,
    text,
    attachmentUrl,
    attachmentType,
  }: SendMessageInput): Promise<Conversation> => {
    const trimmed = text.trim();
    const now = new Date().toISOString();
    const messageId = generateId('msg');

    let convRow = conversationId ? conversationRows.find((c) => c.id === conversationId) : undefined;
    // One thread per (renter, owner) pair regardless of car -- see the "CHAT
    // UNIFICATION" note in supabase_migration_multidevice.sql. This is only
    // reached when the caller started from "fresh" context (no existing
    // conversationId, e.g. tapping "Message Owner" from a car's details),
    // so if the renter/owner pair already has a thread going, we reuse it
    // instead of creating a second, seemingly-empty one.
    let reusedExistingForNewCar = false;
    if (!convRow && startInfo) {
      convRow = conversationRows.find(
        (c) => c.renter_id === startInfo.renterId && c.owner_id === startInfo.ownerId,
      );
      if (convRow && convRow.car_id !== startInfo.carId) reusedExistingForNewCar = true;
    }

    if (!convRow) {
      if (!startInfo) {
        throw new Error('Cannot start a new conversation without startInfo.');
      }
      const newId = generateId('conv');
      const { error: convError } = await supabase.from('conversations').insert({
        id: newId,
        car_id: startInfo.carId,
        car_name: startInfo.carName,
        renter_id: startInfo.renterId,
        renter_name: startInfo.renterName,
        renter_avatar: startInfo.renterAvatar,
        owner_id: startInfo.ownerId,
        owner_name: startInfo.ownerName,
        owner_avatar: startInfo.ownerAvatar,
      });
      if (convError) {
        // 23505 = unique (renter_id, owner_id) violation -- another send (a
        // double-tap, or the same thread started from two devices at once)
        // created this exact conversation a moment earlier. Fall through to
        // the "existing conversation" path below instead of surfacing a
        // confusing error for what is really just a race.
        //
        // PRODUCTION-AUDIT FIX -- this used to call `await fetchAll()` and
        // then read `conversationRows` right after, but `conversationRows`
        // here is a plain variable captured by this closure at the render
        // that created `sendMessage`; `fetchAll()`'s `setConversationRows`
        // schedules a state update, it does not mutate that captured
        // variable. So this lookup was reading the SAME stale (pre-race)
        // array every time, essentially never finding the conversation the
        // other concurrent request had just created, and the exact
        // concurrent-send race this code exists to handle fell through to
        // "We couldn't start this conversation right now" instead of
        // recovering. A direct, targeted query for that one row (rather than
        // depending on React state timing) fixes it, and also seeds the
        // local cache so any other concurrent caller in this same session
        // sees it immediately too.
        if (convError.code === '23505') {
          const { data: existingRow, error: raceFetchError } = await supabase
            .from('conversations')
            .select('*')
            .eq('renter_id', startInfo.renterId)
            .eq('owner_id', startInfo.ownerId)
            .maybeSingle();
          if (raceFetchError) {
            console.log(`VELORA_CONVERSATIONS_RACE_REFETCH_ERROR: ${raceFetchError.message}`);
          }
          if (existingRow) {
            convRow = existingRow as ConversationRow;
            if (convRow.car_id !== startInfo.carId) reusedExistingForNewCar = true;
            const resolvedRow = convRow;
            setConversationRows((prev) => (prev.some((c) => c.id === resolvedRow.id) ? prev : [resolvedRow, ...prev]));
          }
        }
        if (!convRow) {
          throw new Error("We couldn't start this conversation right now. Please try again.");
        }
      } else {
        convRow = {
          id: newId,
          car_id: startInfo.carId,
          car_name: startInfo.carName,
          renter_id: startInfo.renterId,
          renter_name: startInfo.renterName,
          renter_avatar: startInfo.renterAvatar,
          owner_id: startInfo.ownerId,
          owner_name: startInfo.ownerName,
          owner_avatar: startInfo.ownerAvatar,
          last_message: '',
          last_message_at: now,
          unread_for_renter: 0,
          unread_for_owner: 0,
          archived_for_renter: false,
          archived_for_owner: false,
          created_at: now,
        };
      }
    }

    // Existing thread reused for a different car than it started with --
    // point car_id/car_name at the newest topic so "which car is this about"
    // stays meaningful, without losing any prior message history.
    if (reusedExistingForNewCar && startInfo) {
      convRow = { ...convRow, car_id: startInfo.carId, car_name: startInfo.carName };
      supabase
        .from('conversations')
        .update({ car_id: startInfo.carId, car_name: startInfo.carName })
        .eq('id', convRow.id)
        .then(({ error }) => {
          if (error) console.log(`VELORA_CONVERSATIONS_UPDATE_CAR_ERROR: ${error.message}`);
        });
    }

    const finalConvRow = convRow;

    const { error: msgError } = await supabase.from('chat_messages').insert({
      id: messageId,
      conversation_id: finalConvRow.id,
      sender_id: senderId,
      text: trimmed,
      attachment_url: attachmentUrl ?? null,
      attachment_type: attachmentType ?? null,
    });
    if (msgError) {
      console.log(`VELORA_CHAT_MESSAGES_INSERT_ERROR: ${msgError.message}`);
      throw new Error("We couldn't send that message right now. Please try again.");
    }

    const message: ChatMessage = { id: messageId, senderId, text: trimmed, createdAt: now, attachmentUrl, attachmentType };

    // Predict the same update the velora_bump_conversation_on_message
    // trigger applies server-side, so the caller (and this device's own
    // screen) sees the correct result immediately rather than waiting on
    // the realtime round-trip. The real row is the source of truth once the
    // next fetch (realtime-triggered) lands.
    // PHASE 4 -- a new message un-archives the thread for whoever is
    // RECEIVING it (never the sender's own archive state) -- see
    // Conversation.archivedForRenter/archivedForOwner's own comment for why.
    const updatedRow: ConversationRow = {
      ...finalConvRow,
      last_message: trimmed,
      last_message_at: now,
      unread_for_renter: senderRole === 'owner' ? finalConvRow.unread_for_renter + 1 : 0,
      unread_for_owner: senderRole === 'renter' ? finalConvRow.unread_for_owner + 1 : 0,
      archived_for_renter: senderRole === 'renter' ? finalConvRow.archived_for_renter : false,
      archived_for_owner: senderRole === 'owner' ? finalConvRow.archived_for_owner : false,
    };

    // The last_message/last_message_at/unread bump above is predicted
    // client-side only for instant UI feedback -- the actual write is the
    // velora_bump_conversation_on_message trigger, unmodified. The archive
    // reset has no such trigger (and this file deliberately doesn't touch
    // that trigger, whose exact current definition isn't available to
    // rewrite safely), so it needs its own explicit update here -- only
    // fired when there's actually something to clear, and only ever
    // targets the RECEIVING side's column, mirroring the fire-and-forget
    // car_id/car_name update just above for a reused thread.
    const receiverArchivedField = senderRole === 'renter' ? 'archived_for_owner' : 'archived_for_renter';
    if (finalConvRow[receiverArchivedField]) {
      supabase
        .from('conversations')
        .update({ [receiverArchivedField]: false })
        .eq('id', finalConvRow.id)
        .then(({ error }) => {
          if (error) console.log(`VELORA_CONVERSATION_UNARCHIVE_ON_MESSAGE_ERROR: ${error.message}`);
        });
    }

    setConversationRows((prev) => {
      const exists = prev.some((c) => c.id === updatedRow.id);
      return exists ? prev.map((c) => (c.id === updatedRow.id ? updatedRow : c)) : [updatedRow, ...prev];
    });
    setMessagesByConv((prev) => ({ ...prev, [finalConvRow.id]: [...(prev[finalConvRow.id] ?? []), message] }));

    await notify({
      userId: senderRole === 'renter' ? updatedRow.owner_id : updatedRow.renter_id,
      type: 'message',
      title: `New message from ${senderRole === 'renter' ? updatedRow.renter_name : updatedRow.owner_name}`,
      message: trimmed,
      target: { kind: 'conversation', id: updatedRow.id },
    });

    return rowToConversation(updatedRow, [...(messagesByConv[finalConvRow.id] ?? []), message]);
  };

  const markRead = (conversationId: string, role: UserRole) => {
    // No-op when the target role's unread count is already 0 -- avoids an
    // update-then-refetch loop when a screen's effect calls this on every
    // re-render (see the original AsyncStorage version's identical guard).
    const target = conversationRows.find((c) => c.id === conversationId);
    if (!target) return;
    const alreadyRead = role === 'renter' ? target.unread_for_renter === 0 : target.unread_for_owner === 0;
    if (alreadyRead) return;

    setConversationRows((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, unread_for_renter: role === 'renter' ? 0 : c.unread_for_renter, unread_for_owner: role === 'owner' ? 0 : c.unread_for_owner }
          : c,
      ),
    );
    const patch = role === 'renter' ? { unread_for_renter: 0 } : { unread_for_owner: 0 };
    supabase
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.log(`VELORA_CONVERSATIONS_MARK_READ_ERROR: ${error.message}`);
      });
  };

  // PHASE 4 -- shared by archiveConversation/unarchiveConversation below.
  // Updates local state immediately (same optimistic pattern as markRead
  // just above), then persists to Supabase; a failure here just means the
  // toggle doesn't stick past a refetch, logged rather than surfaced as a
  // hard error -- archiving is a convenience, not something worth blocking
  // the screen over.
  const setArchived = async (conversationId: string, role: UserRole, archived: boolean): Promise<void> => {
    const patch = role === 'renter' ? { archived_for_renter: archived } : { archived_for_owner: archived };
    setConversationRows((prev) => prev.map((c) => (c.id === conversationId ? { ...c, ...patch } : c)));
    const { error } = await supabase.from('conversations').update(patch).eq('id', conversationId);
    if (error) {
      console.log(`VELORA_CONVERSATION_ARCHIVE_ERROR id=${conversationId} role=${role} archived=${archived} message=${error.message}`);
    }
  };

  const value = useMemo<MessagesContextValue>(
    () => ({
      isLoaded,
      getConversation: (id) => conversations.find((c) => c.id === id),
      getConversationsForUser: (userId, role, opts) =>
        conversations
          .filter((c) => (role === 'renter' ? c.renterId === userId : c.ownerId === userId))
          .filter((c) => opts?.includeArchived || !(role === 'renter' ? c.archivedForRenter : c.archivedForOwner))
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
      findConversation,
      sendMessage,
      markRead,
      getUnreadCountForUser: (userId, role) =>
        conversations
          .filter((c) => (role === 'renter' ? c.renterId === userId : c.ownerId === userId))
          .reduce((sum, c) => sum + (role === 'renter' ? c.unreadForRenter : c.unreadForOwner), 0),
      archiveConversation: (conversationId, role) => setArchived(conversationId, role, true),
      unarchiveConversation: (conversationId, role) => setArchived(conversationId, role, false),
      refreshConversations: fetchAll,
    }),
    [conversations, isLoaded],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
};

export const useMessages = (): MessagesContextValue => {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used within a MessagesProvider');
  return ctx;
};
