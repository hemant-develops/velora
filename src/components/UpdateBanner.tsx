import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { colors, radii, shadows, spacing, typography } from '../theme';

// IN-APP OTA UPDATE BANNER -- the visible half of the EAS Update flow.
// useAppUpdatePrompt runs one silent Updates.checkForUpdateAsync() per app
// open; that call (and the fetchUpdateAsync/reloadAsync calls made in this
// component) all mutate the SAME native expo-updates state machine that
// Updates.useUpdates() below reads, so this banner reacts automatically to
// both the automatic on-open check and the manual "Check for Updates" row
// in Profile -- no extra plumbing between them.
//
// States, in priority order:
//   isUpdatePending  -> downloaded, ready -- "Update ready" / "Update now"
//   isDownloading    -> "Downloading update -- NN%" (or indeterminate)
//   isUpdateAvailable -> "Update available" / "Download update" (dismissible)
//   otherwise        -> renders nothing
//
// This is purely additive chrome floated over AppNavigation, not a gate in
// front of it: a failed check (useAppUpdatePrompt) or a failed download
// (caught below) just leaves the app running exactly as before -- never a
// blank screen, per spec. Renders nothing at all outside a real EAS
// build/APK (Updates.isEnabled is false in Expo Go and local dev clients).
export const UpdateBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isChecking, isUpdateAvailable, isUpdatePending, isDownloading, downloadProgress, checkError, downloadError } =
    Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const wasAvailableRef = useRef(false);

  // A fresh "update available" -- e.g. a later automatic re-check finding
  // a newer update than one the person already dismissed or failed to
  // download -- should surface again rather than staying hidden forever.
  useEffect(() => {
    if (isUpdateAvailable && !wasAvailableRef.current) {
      setDismissed(false);
      setFetchFailed(false);
    }
    wasAvailableRef.current = isUpdateAvailable;
  }, [isUpdateAvailable]);

  // Diagnostic breadcrumb -- logs every native state-machine transition this
  // component observes, so a real device run can be verified from `adb
  // logcat | grep VELORA_UPDATE` instead of guessed at. checkError/
  // downloadError surface failures from expo-updates' own AUTOMATIC
  // background check too (the one that runs natively on every launch
  // regardless of this app's code), which useAppUpdatePrompt's try/catch
  // cannot see since that only wraps this app's own explicit call.
  useEffect(() => {
    console.log(
      `VELORA_UPDATE_STATE: isChecking=${isChecking} isUpdateAvailable=${isUpdateAvailable} ` +
        `isUpdatePending=${isUpdatePending} isDownloading=${isDownloading} ` +
        `downloadProgress=${downloadProgress ?? 'n/a'} checkError=${checkError?.message ?? 'none'} ` +
        `downloadError=${downloadError?.message ?? 'none'}`,
    );
  }, [isChecking, isUpdateAvailable, isUpdatePending, isDownloading, downloadProgress, checkError, downloadError]);

  if (!Updates.isEnabled) return null;

  if (isUpdatePending) {
    return (
      <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={[styles.card, shadows.md, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.white} />
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: colors.white }]}>Update ready</Text>
            <Text style={[styles.body, { color: 'rgba(255,255,255,0.85)' }]}>Restart VELORA to finish updating.</Text>
          </View>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
            accessibilityRole="button"
            accessibilityLabel="Update now"
            onPress={() => {
              Updates.reloadAsync().catch((err) => {
                console.log(`VELORA_UPDATE_RELOAD_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
              });
            }}
          >
            <Text style={[styles.actionText, { color: colors.white }]}>Update now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isDownloading || fetching) {
    const pct = downloadProgress && downloadProgress > 0 ? Math.round(downloadProgress * 100) : null;
    return (
      <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={[styles.card, shadows.md]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={styles.textCol}>
            <Text style={styles.title}>{pct !== null ? `Downloading update -- ${pct}%` : 'Downloading update…'}</Text>
            <Text style={styles.body}>VELORA keeps working while this finishes.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (isUpdateAvailable && !dismissed) {
    return (
      <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={[styles.card, shadows.md]}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
          <View style={styles.textCol}>
            <Text style={styles.title}>Update available</Text>
            <Text style={styles.body}>
              {fetchFailed ? "Couldn't download -- tap to try again." : 'A new version of VELORA is ready to download.'}
            </Text>
          </View>
          <Pressable
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Download update"
            onPress={async () => {
              setFetching(true);
              setFetchFailed(false);
              try {
                await Updates.fetchUpdateAsync();
              } catch (err) {
                console.log(`VELORA_UPDATE_FETCH_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`);
                setFetchFailed(true);
              } finally {
                setFetching(false);
              }
            }}
          >
            <Text style={styles.actionText}>Download</Text>
          </Pressable>
          <Pressable
            style={styles.dismissBtn}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update prompt"
            onPress={() => setDismissed(true)}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 999,
    elevation: 999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  textCol: { flex: 1, marginLeft: spacing.sm, marginRight: spacing.xs },
  title: { ...typography.titleMd, color: colors.textPrimary },
  body: { ...typography.bodySm, color: colors.textSecondary, marginTop: 1 },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: { ...typography.caption, color: colors.onPrimary, fontWeight: '700' },
  dismissBtn: { marginLeft: spacing.xs, padding: 2 },
});
