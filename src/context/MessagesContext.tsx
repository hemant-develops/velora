import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import { ChatMessage, Conversation, UserRole } from '../types';
import { generateId } from '../utils/format';
import { useNotifications } from './NotificationsContext';

// Bumped key: the old value under 'velora.conversations.v1' held the
// hardcoded demo conversations (Driver Support, VELORA Support, ...) in the
// old shape. Messaging is now fully live and per-(renter, owner, car), so it
// gets a fresh store rather than trying to migrate the old dummy shape.
const CONVERSATIONS_KEY = 'velora.conversations.v2';

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
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

export const MessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { notify } = useNotifications();

  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(CONVERSATIONS_KEY);
        if (raw) setConversations(JSON.parse(raw));
      } catch {
        // Corrupted/unreadable storage — fall back to no conversations
        // rather than leaving the screen stuck on a loading state forever.
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const persist = async (next: Conversation[]) => {
    setConversations(next);
    await storage.setItem(CONVERSATIONS_KEY, JSON.stringify(next));
  };

  const findConversation = (carId: string, renterId: string, ownerId: string) =>
    conversations.find((c) => c.carId === carId && c.renterId === renterId && c.ownerId === ownerId);

  // A conversation only becomes real — persisted, and visible to the owner —
  // once the first message is actually sent. Until then it's just context
  // (startInfo) passed along from "Message Owner" on Car Details.
  const sendMessage = async ({ conversationId, startInfo, senderId, senderRole, text }: SendMessageInput): Promise<Conversation> => {
    const trimmed = text.trim();
    const now = new Date().toISOString();
    const message: ChatMessage = { id: generateId('msg'), senderId, text: trimmed, createdAt: now };

    let existing = conversationId ? conversations.find((c) => c.id === conversationId) : undefined;
    if (!existing && startInfo) {
      existing = findConversation(startInfo.carId, startInfo.renterId, startInfo.ownerId);
    }

    if (existing) {
      const updated: Conversation = {
        ...existing,
        messages: [...existing.messages, message],
        lastMessage: trimmed,
        lastMessageAt: now,
        unreadForRenter: senderRole === 'owner' ? existing.unreadForRenter + 1 : 0,
        unreadForOwner: senderRole === 'renter' ? existing.unreadForOwner + 1 : 0,
      };
      await persist(conversations.map((c) => (c.id === updated.id ? updated : c)));
      await notify({
        userId: senderRole === 'renter' ? updated.ownerId : updated.renterId,
        type: 'message',
        title: `New message from ${senderRole === 'renter' ? updated.renterName : updated.ownerName}`,
        message: trimmed,
        target: { kind: 'conversation', id: updated.id },
      });
      return updated;
    }

    if (!startInfo) {
      throw new Error('Cannot start a new conversation without startInfo.');
    }

    const created: Conversation = {
      id: generateId('conv'),
      carId: startInfo.carId,
      carName: startInfo.carName,
      renterId: startInfo.renterId,
      renterName: startInfo.renterName,
      renterAvatar: startInfo.renterAvatar,
      ownerId: startInfo.ownerId,
      ownerName: startInfo.ownerName,
      ownerAvatar: startInfo.ownerAvatar,
      messages: [message],
      lastMessage: trimmed,
      lastMessageAt: now,
      unreadForRenter: 0,
      unreadForOwner: senderRole === 'renter' ? 1 : 0,
    };
    await persist([created, ...conversations]);
    await notify({
      userId: senderRole === 'renter' ? created.ownerId : created.renterId,
      type: 'message',
      title: `New message from ${senderRole === 'renter' ? created.renterName : created.ownerName}`,
      message: trimmed,
      target: { kind: 'conversation', id: created.id },
    });
    return created;
  };

  const markRead = (conversationId: string, role: UserRole) => {
    const next = conversations.map((c) =>
      c.id === conversationId
        ? { ...c, unreadForRenter: role === 'renter' ? 0 : c.unreadForRenter, unreadForOwner: role === 'owner' ? 0 : c.unreadForOwner }
        : c,
    );
    persist(next);
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
