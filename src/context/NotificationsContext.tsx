import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppNotification, NotificationTargetKind } from '../types';
import { generateId } from '../utils/format';
import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION -- notifications used to live only in this
// device's AsyncStorage (`velora.notifications.v1`), so an owner's phone
// would never actually alert them about a booking a renter made on a
// different phone. They now live in the real, shared `public.notifications`
// table (see supabase_migration_multidevice.sql). A user can only ever
// SELECT/UPDATE their own rows (RLS: user_id = auth.uid()); creating a
// notification FOR someone else (e.g. the renter's device notifying the
// owner) goes through the `create_notification` SECURITY DEFINER RPC
// instead of a direct insert -- the same "RPC-mediated cross-user write"
// pattern this app already uses for booking holds -- so a user can never
// write directly into someone else's notification feed.

export type NotifyInput = Omit<AppNotification, 'id' | 'createdAt' | 'read'>;

interface NotificationsContextValue {
  isLoaded: boolean;
  getForUser: (userId: string) => AppNotification[];
  getUnreadCountForUser: (userId: string) => number;
  markRead: (id: string) => Promise<void>;
  markAllReadForUser: (userId: string) => Promise<void>;
  notify: (input: NotifyInput) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  target_kind: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
}

const rowToNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  userId: row.user_id,
  type: row.type as AppNotification['type'],
  title: row.title,
  message: row.message,
  read: row.read,
  createdAt: row.created_at,
  target:
    row.target_kind && row.target_id
      ? { kind: row.target_kind as NotificationTargetKind, id: row.target_id }
      : undefined,
});

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchNotifications = async () => {
    try {
      // RLS returns only this signed-in user's own notifications.
      const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (error) {
        console.log(`VELORA_NOTIFICATIONS_FETCH_ERROR: ${error.message}`);
        return;
      }
      setNotifications(((data ?? []) as NotificationRow[]).map(rowToNotification));
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchNotifications();
    });
    // Live updates -- a new notification (booking request, status change,
    // message) appears immediately without reopening the app.
    const channel = supabase
      .channel('notifications_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // The single entry point every real event (a booking created/changing
  // status, a chat message) calls into. Routed through create_notification
  // (SECURITY DEFINER) since `input.userId` is very often someone OTHER
  // than whoever is calling this (e.g. a renter's device notifying the
  // car's owner) -- see this file's top comment for why a direct insert
  // isn't allowed for that case.
  const notify = async (input: NotifyInput) => {
    const id = generateId('notif');
    const { error } = await supabase.rpc('create_notification', {
      p_id: id,
      p_user_id: input.userId,
      p_type: input.type,
      p_title: input.title,
      p_message: input.message,
      p_target_kind: input.target?.kind ?? null,
      p_target_id: input.target?.id ?? null,
    });
    if (error) {
      console.log(`VELORA_NOTIFICATIONS_CREATE_ERROR: ${error.message}`);
      return;
    }
    // Optimistic local insert so the CURRENT user's own device (e.g. an
    // owner notifying themselves isn't a real case, but a user re-notified
    // by their own action would otherwise wait on the realtime round-trip)
    // sees it immediately. The realtime subscription above is what delivers
    // this to the OTHER user's device (e.g. renter's phone -> owner's phone).
    const notification: AppNotification = { id, createdAt: new Date().toISOString(), read: false, ...input };
    setNotifications((prev) => [notification, ...prev]);
  };

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) console.log(`VELORA_NOTIFICATIONS_MARK_READ_ERROR: ${error.message}`);
  };

  const markAllReadForUser = async (userId: string) => {
    setNotifications((prev) => prev.map((n) => (n.userId === userId ? { ...n, read: true } : n)));
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    if (error) console.log(`VELORA_NOTIFICATIONS_MARK_ALL_READ_ERROR: ${error.message}`);
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
