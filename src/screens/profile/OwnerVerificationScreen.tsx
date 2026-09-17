import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { readUriAsBlobWithRetry, uploadOwnerIdDocument } from '../../utils/uploadImage';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerVerification'>;

const ID_TYPES = ['Aadhaar Card', 'PAN Card', 'Driving License'];

// SECURITY FIX -- real, server-reviewed verification (see
// 0020_owner_verifications.sql / AuthContext.submitOwnerVerification),
// replacing the previous instant-fake-approve flow. This screen now has
// four real states instead of one: 'none' (show the form), 'pending'
// (already submitted, awaiting admin review), 'verified' (nothing to do
// here), 'rejected' (show why, allow resubmission).
export const OwnerVerificationScreen: React.FC<Props> = ({ navigation }) => {
  const { user, submitOwnerVerification, refreshOwnerVerificationStatus } = useAuth();
  const status = user?.ownerVerification?.status ?? 'none';

  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [idType, setIdType] = useState(ID_TYPES[0]);
  const [idNumber, setIdNumber] = useState('');
  const [documentUri, setDocumentUri] = useState<string | undefined>();
  const [documentBlob, setDocumentBlob] = useState<Blob | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onPickDocument = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Allow camera access to photograph your ID.' : 'Allow photo library access to select your ID photo.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setDocumentUri(uri);
    try {
      // Same pre-read-at-pick-time hardening every other photo upload in
      // this app uses (see uploadImage.ts) -- the OS read grant on a picked
      // content:// URI isn't guaranteed to still be valid by the time this
      // form is actually submitted.
      setDocumentBlob(await readUriAsBlobWithRetry(uri, 'ID photo'));
    } catch {
      setDocumentBlob(undefined);
    }
  };

  const onSubmit = async () => {
    if (!user) return;
    if (!fullName.trim()) return setError('Enter your full legal name.');
    if (!phone.trim() || phone.trim().length < 8) return setError('Enter a valid phone number.');
    if (!idNumber.trim()) return setError('Enter your ID number.');
    if (!documentUri) return setError('Add a photo of your ID document.');

    setError(undefined);
    setSubmitting(true);
    try {
      const idDocumentPath = await uploadOwnerIdDocument(documentUri, user.id, documentBlob);
      const result = await submitOwnerVerification({
        fullName: fullName.trim(),
        phone: phone.trim(),
        idType,
        idNumber: idNumber.trim(),
        idDocumentPath,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Stays on this screen -- it now renders the 'pending' state below
      // instead of assuming approval and jumping into Owner Mode, which
      // no longer happens until an admin actually reviews this.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onRefreshStatus = async () => {
    setRefreshing(true);
    await refreshOwnerVerificationStatus();
    setRefreshing(false);
  };

  if (status === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Owner Verification" onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Ionicons name="time-outline" size={40} color={colors.primaryDark} />
          <Text style={styles.introTitle}>Verification under review</Text>
          <Text style={styles.introBody}>
            Thanks — your details are with our team. This usually takes a short while; you'll be notified once it's reviewed.
          </Text>
          <PrimaryButton
            label={refreshing ? 'Checking…' : 'Check Status'}
            onPress={onRefreshStatus}
            loading={refreshing}
            variant="outline"
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>
    );
  }

  if (status === 'verified') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Owner Verification" onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Ionicons name="shield-checkmark" size={40} color={colors.success} />
          <Text style={styles.introTitle}>You're verified</Text>
          <Text style={styles.introBody}>Your account is verified — you can list cars and switch to Owner Mode from your profile.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Owner Verification" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.introCard}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primaryDark} />
          <Text style={styles.introTitle}>Verify to start listing cars</Text>
          <Text style={styles.introBody}>
            To keep VELORA's marketplace trustworthy, every rental owner confirms their identity once before their
            first listing goes live. Our team reviews each submission.
          </Text>
        </View>

        {status === 'rejected' && user?.ownerVerification?.rejectionReason ? (
          <View style={styles.rejectedCard}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.rejectedText}>
              Your previous submission wasn't approved: {user.ownerVerification.rejectionReason}. You can resubmit below.
            </Text>
          </View>
        ) : null}

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

        <Text style={styles.label}>ID Document Photo</Text>
        {documentUri ? (
          <View style={styles.documentPreviewRow}>
            <Image source={{ uri: documentUri }} style={styles.documentPreview} />
            <Pressable onPress={() => onPickDocument(false)}>
              <Text style={styles.changePhotoText}>Change photo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.documentPickRow}>
            <Pressable style={styles.documentPickBtn} onPress={() => onPickDocument(false)}>
              <Ionicons name="image-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.documentPickText}>Choose Photo</Text>
            </Pressable>
            <Pressable style={styles.documentPickBtn} onPress={() => onPickDocument(true)}>
              <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.documentPickText}>Take Photo</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.privacyNote}>
          Your ID number is never stored as plain text, and your document photo is kept private — only you and VELORA's review team can access it.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label={submitting ? 'Submitting...' : 'Submit for Verification'}
          onPress={onSubmit}
          loading={submitting}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  introCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  introTitle: { ...typography.headingSm, color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' },
  introBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 6, lineHeight: 19, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  rejectedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.dangerBg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  rejectedText: { ...typography.bodySm, color: colors.textPrimary, flex: 1, lineHeight: 18 },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  documentPickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  documentPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  documentPickText: { ...typography.bodyMd, color: colors.textPrimary },
  documentPreviewRow: { alignItems: 'center', marginBottom: spacing.sm },
  documentPreview: { width: '100%', height: 180, borderRadius: radii.md, backgroundColor: colors.surface },
  changePhotoText: { ...typography.bodySm, color: colors.primaryDark, marginTop: spacing.xs },
  privacyNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs, marginBottom: spacing.sm, lineHeight: 16 },
  error: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
});
