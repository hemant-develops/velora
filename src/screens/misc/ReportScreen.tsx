import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useReports } from '../../context/ReportsContext';
import { ReportReason } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'inappropriate_content', label: 'Inappropriate content' },
  { key: 'suspicious_behavior', label: 'Suspicious behavior' },
  { key: 'fraud_or_scam', label: 'Fraud or scam' },
  { key: 'inaccurate_listing', label: 'Inaccurate listing' },
  { key: 'safety_concern', label: 'Safety concern' },
  { key: 'other', label: 'Other' },
];

const TARGET_LABEL: Record<Props['route']['params']['targetKind'], string> = {
  car: 'this listing',
  user: 'this person',
  conversation: 'this conversation',
};

// Reachable from Car Details, an Owner/Customer public profile, and a
// Conversation -- always about one concrete thing the person was already
// looking at (see the Report type's own comment), never a generic/unscoped
// complaint form. Every field this screen needs (targetKind/targetId/
// targetLabel) arrives via route params from whichever screen it was opened
// from, so this never depends on AuthContext.getUserById for anything but
// the CURRENT user (the reporter) -- which is the one lookup that's always
// reliable under real Supabase Auth's RLS.
export const ReportScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { submitReport, hasReportedTarget } = useReports();
  const { targetKind, targetId, targetLabel } = route.params;

  const [reason, setReason] = useState<ReportReason | undefined>();
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const alreadyReported = hasReportedTarget(user.id, targetKind, targetId);

  if (alreadyReported) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Report" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="checkmark-circle-outline"
          title="Already reported"
          subtitle={`You've already reported ${TARGET_LABEL[targetKind]}. Our team will review it.`}
        />
      </View>
    );
  }

  const onSubmit = async () => {
    // M10 hardening: explicit re-entrancy guard (matches the pattern already
    // used in RentalAgreementScreen.onSign) so a fast double-tap can never
    // fire submitReport twice for one report, rather than relying solely on
    // PrimaryButton disabling itself once `saving` is true.
    if (!reason || saving) return;
    setSaving(true);
    // MULTI-DEVICE MIGRATION -- submitReport now writes to Supabase and can
    // genuinely throw (a network hiccup). Without this try/catch that was an
    // unhandled promise rejection: `saving` never reset and the person had
    // no idea their report didn't actually go through.
    try {
      await submitReport({
        reporterId: user.id,
        targetKind,
        targetId,
        targetLabel,
        reason,
        details: details.trim(),
      });
      Alert.alert('Report submitted', "Thanks for letting us know — we'll look into this.", [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_REPORT_SUBMIT_FAILED: ${message}`);
      Alert.alert("Couldn't submit report", 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Report" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={[styles.targetCard, shadows.sm]}>
          <Ionicons name="flag-outline" size={18} color={colors.danger} />
          <Text style={styles.targetText} numberOfLines={2}>
            Reporting: <Text style={{ fontWeight: '700' }}>{targetLabel}</Text>
          </Text>
        </View>

        <Text style={styles.sectionTitle}>What's wrong?</Text>
        <View style={styles.chipRow}>
          {REASONS.map((r) => (
            <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Additional details (optional)</Text>
        <InputField
          placeholder="Tell us more about what happened..."
          value={details}
          onChangeText={setDetails}
          multiline
          style={{ height: 110, textAlignVertical: 'top' }}
        />

        <Text style={styles.disclaimer}>
          Reports are reviewed to help keep VELORA safe for everyone. If you're in immediate danger, please contact
          local authorities first.
        </Text>

        <PrimaryButton
          label="Submit Report"
          onPress={onSubmit}
          loading={saving}
          disabled={!reason}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  targetText: { ...typography.bodyMd, color: colors.textPrimary, marginLeft: spacing.sm, flex: 1 },
  sectionTitle: { ...typography.headingSm, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  disclaimer: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 17 },
});
