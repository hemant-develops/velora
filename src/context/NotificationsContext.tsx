import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import { AppNotification } from '../types';
import { generateId } from '../utils/format';

const NOTIFICATIONS_KEY = 'velora.notifications.v1';

export type NotifyInput = Omit<AppNotification, 'id' | 'createdAt' | 'read'>;

interface NotificationsContextValue {
  isLoaded: boolean;
  getForUser: (userId: string) => AppNotification[];
  getUnreadCountForUser: (userId: string) => number;
  markRead: (id: string) => Promise<void>;
  markAllReadForUser: (userId: string) => Promise<void>;
  // The single entry point every real event (a booking created/changing
  // status, a chat message) calls into -- BookingsContext and
  // MessagesContext each build their own title/message/target from the
  // event they already own, rather than this context knowing anything
  // about bookings or chats itself. Nothing here ever invents content on
  // its own (no timers, no render-time generation), so a notification only
  // ever exists because a real event called this function once.
  notify: (input: NotifyInput) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(NOTIFICATIONS_KEY);
        if (raw) setNotifications(JSON.parse(raw));
      } catch {
        // Corrupted/unreadable storage -- start with an empty list rather
        // than leaving the screen stuck loading forever.
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // Every mutation reads the latest state via the updater-function form of
  // setState (not the `notifications` closure) and persists from inside
  // it, so two notify() calls fired back-to-back for the same event (e.g.
  // "notify the owner" + "notify the renter" from one booking) never
  // clobber each other by both reading a stale snapshot.
  const notify = async (input: NotifyInput) => {
    const notification: AppNotification = {
      id: generateId('notif'),
      createdAt: new Date().toISOString(),
      read: false,
      ...input,
    };
    setNotifications((prev) => {
      const next = [notification, ...prev];
      storage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const markRead = async (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      storage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const markAllReadForUser = async (userId: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.userId === userId ? { ...n, read: true } : n));
      storage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo<NotificationsContextValue>(
    () => ({
      isLoaded,
      getForUser: (userId) =>
        notifications
          .filter((n) => n.userId === userId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      getUnreadCountForUser: (userId) => notifications.filter((n) => n.userId === userId && !n.read).length,
      markRead,
      markAllReadForUser,
      notify,
    }),
    [notifications, isLoaded],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
};
