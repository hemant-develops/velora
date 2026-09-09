import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerVerification'>;

const ID_TYPES = ['Aadhaar Card', 'PAN Card', 'Driving License'];

export const OwnerVerificationScreen: React.FC<Props> = ({ navigation }) => {
  const { user, submitOwnerVerification } = useAuth();

  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [idType, setIdType] = useState(ID_TYPES[0]);
  const [idNumber, setIdNumber] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!fullName.trim()) return setError('Enter your full legal name.');
    if (!phone.trim() || phone.trim().length < 8) return setError('Enter a valid phone number.');
    if (!idNumber.trim()) return setError('Enter your ID number.');

    setError(undefined);
    setSubmitting(true);
    // Simulated verification delay — a real build would call an actual
    // KYC / ID-verification provider (e.g. DigiLocker / Aadhaar eKYC) here.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await submitOwnerVerification({ fullName: fullName.trim(), phone: phone.trim(), idType, idNumber: idNumber.trim() });
    setSubmitting(false);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Owner Verification" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.introCard}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primaryDark} />
          <Text style={styles.introTitle}>Verify to start listing cars</Text>
          <Text style={styles.introBody}>
            To keep VELORA's marketplace trustworthy, every rental owner confirms their identity once before their
            first listing goes live. This takes less than a minute.
          </Text>
        </View>

        <InputField label="Full Legal Name" placeholder="As on your ID" value={fullName} onChangeText={setFullName} />
        <InputField
          label="Phone Number"
          placeholder="e.g. 98765 43210"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Text style={styles.label}>Government ID Type</Text>
        <View style={styles.chipRow}>
          {ID_TYPES.map((t) => (
            <Chip key={t} label={t} selected={idType === t} onPress={() => setIdType(t)} />
          ))}
        </View>

        <InputField label="ID Number" placeholder="Enter the ID number" value={idNumber} onChangeText={setIdNumber} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label={submitting ? 'Verifying...' : 'Submit for Verification'}
          onPress={onSubmit}
          loading={submitting}
          style={{ marginTop: spacing.md }}
        />
        <Text style={styles.demoNote}>
          Demo mode: verification is simulated and approved instantly. A production build would connect a real
          ID-verification / KYC provider here.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  introCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  introTitle: { ...typography.headingSm, color: colors.textPrimary, marginTop: spacing.sm },
  introBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  error: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
  demoNote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
});
