import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationSettings'>;

// PHASE 5 -- Notification Settings. The actual push pipeline (permission,
// Expo token, notify()/create_notification, the send-push Edge Function) was
// already fully built -- this screen is the one missing piece: per-user
// control over which of those pushes reach the phone. A muted category
// still creates the notification and it still shows up in the in-app
// Notifications inbox (NotificationsScreen) -- this only ever suppresses the
// OS push banner, enforced server-side in send-push (see that function's
// own comment) since a signed-in device can only read/write its OWN
// profiles row (RLS: id = auth.uid()), never anyone else's.
interface Preferences {
  pushEnabled: boolean;
  notifyBookings: boolean;
  notifyMessages: boolean;
}

const DEFAULT_PREFS: Preferences = { pushEnabled: true, notifyBookings: true, notifyMessages: true };

interface PreferencesRow {
  push_enabled: boolean | null;
  notify_bookings: boolean | null;
  notify_messages: boolean | null;
}

export const NotificationSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  // 0006_notification_preferences.sql hasn't necessarily been run yet in
  // every environment (same "additive, not required" status as 0005) -- if
  // the columns don't exist, this stays true and every toggle just no-ops
  // with an explanatory toast instead of pretending to save.
  const [columnsAvailable, setColumnsAvailable] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('push_enabled, notify_bookings, notify_messages')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.log(`VELORA_NOTIFICATION_PREFS_LOAD_ERROR: ${error.message}`);
        setColumnsAvailable(false);
        setPrefs(DEFAULT_PREFS);
      } else {
        const row = data as PreferencesRow | null;
        setPrefs({
          pushEnabled: row?.push_enabled ?? true,
          notifyBookings: row?.notify_bookings ?? true,
          notifyMessages: row?.notify_messages ?? true,
        });
      }
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const save = async (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next); // optimistic -- matches this app's existing toggle patterns
    if (!columnsAvailable) {
      showToast("Can't save yet — ask the app owner to run the latest update.");
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        push_enabled: next.pushEnabled,
        notify_bookings: next.notifyBookings,
        notify_messages: next.notifyMessages,
      })
      .eq('id', user.id);
    if (error) {
      console.log(`VELORA_NOTIFICATION_PREFS_SAVE_ERROR: ${error.message}`);
      setPrefs(prefs); // roll back the optimistic flip
      if (/column .* does not exist/i.test(error.message)) {
        setColumnsAvailable(false);
        showToast("Can't save yet — ask the app owner to run the latest update.");
      } else {
        showToast("Couldn't save — check your connection and try again.");
      }
    }
  };

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Notification Settings" onBack={() => navigation.goBack()} />
        <LoadingState />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Notification Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
        <Row
          label="Push Notifications"
          caption="Master switch. Turn this off to stop every push notification to this device."
          value={prefs.pushEnabled}
          onValueChange={(v) => save({ pushEnabled: v })}
        />
        <View style={styles.separator} />
        <Row
          label="Booking Updates"
          caption={user.role === 'owner' ? 'New booking requests and status changes on your cars.' : 'Confirmations, rejections, and status changes on your bookings.'}
          value={prefs.notifyBookings}
          disabled={!prefs.pushEnabled}
          onValueChange={(v) => save({ notifyBookings: v })}
        />
        <View style={styles.separator} />
        <Row
          label="Messages"
          caption="New chat messages from renters and owners."
          value={prefs.notifyMessages}
          disabled={!prefs.pushEnabled}
          onValueChange={(v) => save({ notifyMessages: v })}
        />
        <Text style={styles.note}>
          Turning a category off only stops the push banner — you'll still see it in your Notifications list.
        </Text>
      </ScrollView>
    </View>
  );
};

const Row: React.FC<{
  label: string;
  caption: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (v: boolean) => void;
}> = ({ label, caption, value, disabled, onValueChange }) => (
  <View style={[styles.row, disabled ? styles.rowDisabled : undefined]}>
    <View style={{ flex: 1, marginRight: spacing.md }}>
      <Text style={typography.titleMd}>{label}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
    <Switch
      value={disabled ? false : value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: colors.primary, false: colors.border }}
      thumbColor={colors.white}
    />
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  rowDisabled: { opacity: 0.5 },
  caption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  separator: { height: 1, backgroundColor: colors.borderLight },
  note: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.lg, lineHeight: 16 },
});
