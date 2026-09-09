import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { useLocationSystem } from '../../context/LocationContext';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationPicker'>;

export const LocationPickerScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { status, detectCurrentLocation, setManualLocation } = useLocationSystem();
  const [manualLocation, setManualLocationInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Reached only from the authenticated Main stack (Home's location pill),
  // so `user` is always set in practice — guarding it the same way every
  // other authenticated screen does lets the render below use `user`
  // directly instead of asserting `user!` at the one place it's read.
  if (!user) return null;

  const isDetecting = status === 'checking' || status === 'detecting';
  const hasLocation = !!user.location?.trim();

  const onUseCurrentLocation = async () => {
    await detectCurrentLocation();
  };

  const onSaveManual = async () => {
    if (!manualLocation.trim()) return;
    setSaving(true);
    await setManualLocation(manualLocation.trim());
    setSaving(false);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Set Location" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.currentCard}>
          <Ionicons name="location-sharp" size={18} color={colors.textSecondary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.currentText}>
              {hasLocation ? user.location : 'Not set yet'}
            </Text>
            {hasLocation ? (
              <Text style={styles.sourceText}>
                {user.locationSource === 'manual' ? 'Set manually' : 'Detected from your device'}
              </Text>
            ) : null}
          </View>
        </View>

        {status === 'denied' ? (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              Location permission was denied, so we can't detect your city automatically. You can still set it
              manually below, or try again if you've since allowed the permission in Settings.
            </Text>
          </View>
        ) : null}

        {status === 'unavailable' ? (
          <View style={styles.noticeCard}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              We couldn't get a GPS fix just now. This can happen indoors or with a weak signal — try again, or set
              your location manually below.
            </Text>
          </View>
        ) : null}

        <PrimaryButton
          label={isDetecting ? 'Detecting...' : status === 'unavailable' || status === 'denied' ? 'Try Again' : 'Use Current Location'}
          onPress={onUseCurrentLocation}
          loading={isDetecting}
          icon={
            !isDetecting ? <Ionicons name="navigate" size={18} color={colors.onPrimary} /> : undefined
          }
          style={{ marginBottom: spacing.lg, marginTop: spacing.md }}
        />
        {isDetecting ? (
          <View style={styles.detectingRow}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.detectingText}>
              {status === 'checking' ? 'Waiting for permission...' : 'Detecting your location...'}
            </Text>
          </View>
        ) : null}

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>Or enter manually</Text>
          <View style={styles.orLine} />
        </View>

        <InputField
          label="City / Area"
          placeholder="e.g. Jaipur, Rajasthan"
          leftIcon="location-outline"
          value={manualLocation}
          onChangeText={setManualLocationInput}
        />
        <PrimaryButton
          label="Save Location"
          onPress={onSaveManual}
          variant="outline"
          loading={saving}
          disabled={!manualLocation.trim() || saving}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  currentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  currentText: { ...typography.bodyMd, color: colors.textPrimary },
  sourceText: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: spacing.sm, flex: 1, lineHeight: 18 },
  detectingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: -spacing.md, marginBottom: spacing.lg },
  detectingText: { ...typography.bodySm, color: colors.textSecondary, marginLeft: spacing.sm },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { ...typography.bodySm, color: colors.textSecondary, marginHorizontal: spacing.sm },
});
