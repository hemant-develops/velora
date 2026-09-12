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
}

interface MessagesContextValue {
  isLoaded: boolean;
  getConversation: (id: string) => Conversation | undefined;
  getConversationsForUser: (userId: string, role: UserRole) => Conversation[];
  findConversation: (carId: string, renterId: string, ownerId: string) => Conversation | undefined;
  sendMessage: (input: SendMessageInput) => Promise<Conversation>;
  markRead: (conversationId: string, role: UserRole) => void;
  getUnreadCountForUser: (userId: string, role: UserRole) => number;
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
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
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
        list.push({ id: row.id, senderId: row.sender_id, text: row.text, createdAt: row.created_at });
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

  const findConversation = (carId: string, renterId: string, ownerId: string) =>
    conversations.find((c) => c.carId === carId && c.renterId === renterId && c.ownerId === ownerId);

  // A conversation only becomes real -- persisted, and visible to the owner --
  // once the first message is actually sent. Until then it's just context
  // (startInfo) passed along from "Message Owner" on Car Details.
  const sendMessage = async ({ conversationId, startInfo, senderId, senderRole, text }: SendMessageInput): Promise<Conversation> => {
    const trimmed = text.trim();
    const now = new Date().toISOString();
    const messageId = generateId('msg');

    let convRow = conversationId ? conversationRows.find((c) => c.id === conversationId) : undefined;
    if (!convRow && startInfo) {
      convRow = conversationRows.find(
        (c) => c.car_id === startInfo.carId && c.renter_id === startInfo.renterId && c.owner_id === startInfo.ownerId,
      );
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
        // 23505 = unique (car_id, renter_id, owner_id) violation -- another
        // send (a double-tap, or the same thread started from two devices)
        // created this exact conversation a moment earlier. Refetch and
        // fall through to the "existing conversation" path below instead of
        // surfacing a confusing error for what is really just a race.
        if (convError.code === '23505') {
          await fetchAll();
          convRow = conversationRows.find(
            (c) => c.car_id === startInfo.carId && c.renter_id === startInfo.renterId && c.owner_id === startInfo.ownerId,
          );
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
          created_at: now,
        };
      }
    }

    const finalConvRow = convRow;

    const { error: msgError } = await supabase
      .from('chat_messages')
      .insert({ id: messageId, conversation_id: finalConvRow.id, sender_id: senderId, text: trimmed });
    if (msgError) {
      console.log(`VELORA_CHAT_MESSAGES_INSERT_ERROR: ${msgError.message}`);
      throw new Error("We couldn't send that message right now. Please try again.");
    }

    const message: ChatMessage = { id: messageId, senderId, text: trimmed, createdAt: now };

    // Predict the same update the velora_bump_conversation_on_message
    // trigger applies server-side, so the caller (and this device's own
    // screen) sees the correct result immediately rather than waiting on
    // the realtime round-trip. The real row is the source of truth once the
    // next fetch (realtime-triggered) lands.
    const updatedRow: ConversationRow = {
      ...finalConvRow,
      last_message: trimmed,
      last_message_at: now,
      unread_for_renter: senderRole === 'owner' ? finalConvRow.unread_for_renter + 1 : 0,
      unread_for_owner: senderRole === 'renter' ? finalConvRow.unread_for_owner + 1 : 0,
    };

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

  const value = useMemo<MessagesContextValue>(
    () => ({
      isLoaded,
      getConversation: (id) => conversations.find((c) => c.id === id),
      getConversationsForUser: (userId, role) =>
        conversations
          .filter((c) => (role === 'renter' ? c.renterId === userId : c.ownerId === userId))
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
      findConversation,
      sendMessage,
      markRead,
      getUnreadCountForUser: (userId, role) =>
        conversations
          .filter((c) => (role === 'renter' ? c.renterId === userId : c.ownerId === userId))
          .reduce((sum, c) => sum + (role === 'renter' ? c.unreadForRenter : c.unreadForOwner), 0),
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
