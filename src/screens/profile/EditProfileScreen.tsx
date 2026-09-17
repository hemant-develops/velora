import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { isValidIndianPhone } from '../../utils/format';
import { getProfileCompleteness } from '../../utils/profile';
import { showToast } from '../../utils/toast';
import { isRetryableMessage, isStaleLocalFileMessage, readUriAsBlobWithRetry, STALE_LOCAL_PHOTO_MESSAGE, uploadAvatar } from '../../utils/uploadImage';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  // Local preview only until Save -- the on-device picker URI is shown
  // immediately here, but onSave uploads the real bytes to Supabase Storage
  // (see uploadImage.ts) before it ever reaches updateProfile, so what gets
  // saved is always a real, permanent URL every device can load -- not the
  // local-only URI itself.
  const [avatarUri, setAvatarUri] = useState(user?.avatar ?? '');
  // PHASE 1 IMAGE PIPELINE FIX -- the actual bytes of a newly-picked avatar,
  // read immediately in onChangePhoto (see that function's comment) rather
  // than re-read from avatarUri at Save time, which is the confirmed root
  // cause fix for the same stale-picker-grant 404 covered in
  // OwnerAddCarScreen. Stays undefined for the existing (already-uploaded)
  // avatar URL, in which case uploadAvatar's own https passthrough applies.
  const [avatarBlob, setAvatarBlob] = useState<Blob | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Only show a field's error after the person has actually interacted with
  // it (or tried to save) — otherwise an existing profile that already had
  // an empty/legacy phone number would greet the user with red error text
  // the instant this screen opens, before they've changed anything.
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const nameError = !name.trim() ? 'Name cannot be empty.' : undefined;
  const phoneError = !phone.trim()
    ? 'Phone number cannot be empty.'
    : !isValidIndianPhone(phone)
      ? 'Enter a valid 10-digit mobile number.'
      : undefined;

  const isValid = useMemo(() => !nameError && !phoneError, [nameError, phoneError]);

  if (!user) return null;

  const completeness = getProfileCompleteness(user);

  const onChangePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      // PHASE 1 IMAGE PIPELINE FIX -- read the picked photo's bytes right
      // now, while the picker's read grant on it is certainly still fresh,
      // instead of waiting until Save (potentially much later) to read a
      // URI that may have already gone stale (see the matching comment in
      // OwnerAddCarScreen.prefetchPickedPhotos and uploadImage.ts's
      // `preFetchedBlob`). Surfaces immediately if even this fails, rather
      // than letting the person fill in the rest of the form around a photo
      // that was never actually readable.
      try {
        const blob = await readUriAsBlobWithRetry(uri, 'photo');
        setAvatarUri(uri);
        setAvatarBlob(blob);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`VELORA_AVATAR_PREFETCH_FAILED: ${message}`);
        Alert.alert(
          "Couldn't load photo",
          isStaleLocalFileMessage(message) ? STALE_LOCAL_PHOTO_MESSAGE : "That photo couldn't be loaded. Please try selecting it again.",
        );
      }
    }
  };

  const onSave = async () => {
    setNameTouched(true);
    setPhoneTouched(true);
    if (!isValid) return;

    setSaving(true);
    try {
      // Upload a newly-picked local photo to real Supabase Storage first --
      // an unchanged avatarUri that's already a real URL (didn't touch the
      // photo this edit) passes through untouched. Without this the account
      // would save the on-device-only picker URI directly, which is exactly
      // why profile photos weren't showing up on other devices.
      const uploadedAvatar = avatarUri ? await uploadAvatar(avatarUri, user.id, avatarBlob) : user.avatar;

      // Only ever writes trimmed, already-validated values — never falls
      // back to silently keeping the old value when what's on screen is
      // invalid, since onSave already bails out above in that case.
      const ok = await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        location: location.trim() || user.location,
        avatar: uploadedAvatar,
        ...(user.role === 'owner' ? { bio: bio.trim() } : null),
      });

      if (!ok) {
        Alert.alert("Couldn't save changes", 'Please check your connection and try again.');
        return;
      }

      // B3 -- same silent-success gap as OwnerAddCarScreen's Save/Publish:
      // reuses the existing non-blocking showToast (already proven on the
      // owner dashboard's Active/Inactive toggle) instead of leaving the
      // save unconfirmed.
      showToast('Profile updated');
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_PROFILE_SAVE_FAILED: ${message}`);
      // PRODUCTION-AUDIT FIX -- same accurate-error-classification pattern as
      // OwnerAddCarScreen: a stale/expired session needs a re-login, and a
      // stale picked-photo URI (confirmed device-log root cause -- a 404
      // reading the file, not a network issue) needs "pick it again", neither
      // of which a "check your connection" retry actually fixes.
      const isStalePhoto = isStaleLocalFileMessage(message);
      const isSessionError = /session has expired/i.test(message);
      const isNetworkIssue = isRetryableMessage(message);
      Alert.alert(
        "Couldn't save changes",
        isStalePhoto
          ? 'Selected photo is no longer available. Please choose it again.'
          : isSessionError
            ? 'Your session expired. Please log in again and retry.'
            : isNetworkIssue
              ? 'Please check your connection and try again.'
              // BUG FIX -- any OTHER error (an RLS/permission rejection, a
              // missing storage bucket, a Postgres constraint, ...) used to
              // fall through to the same "check your connection" text even
              // though the actual problem was never the network -- that
              // false diagnosis was the real bug: it hid what was actually
              // wrong from both the user and anyone debugging it. Shows the
              // real message instead of guessing.
              : `Something went wrong: ${message}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Edit Profile" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarWrap}>
          <Pressable onPress={onChangePhoto} accessibilityLabel="Change profile photo">
            <Image source={{ uri: avatarUri || user.avatar }} style={styles.avatar} />
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={15} color={colors.onPrimary} />
            </View>
          </Pressable>
          <Pressable onPress={onChangePhoto} hitSlop={6}>
            <Text style={styles.changePhotoText}>Change Profile Photo</Text>
          </Pressable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(completeness.filled / completeness.total) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {completeness.isComplete
              ? 'Profile complete'
              : `${completeness.filled}/${completeness.total} complete — add ${completeness.missingFields[0].toLowerCase()} to continue`}
          </Text>
        </View>

        <InputField
          label="Full Name"
          value={name}
          onChangeText={setName}
          onBlur={() => setNameTouched(true)}
          leftIcon="person-outline"
          error={nameTouched ? nameError : undefined}
        />
        <InputField label="Email Address" value={user.email} editable={false} leftIcon="mail-outline" style={{ color: colors.textTertiary }} />
        <InputField
          label="Phone Number"
          value={phone}
          onChangeText={setPhone}
          onBlur={() => setPhoneTouched(true)}
          keyboardType="phone-pad"
          leftIcon="call-outline"
          error={phoneTouched ? phoneError : undefined}
        />
        <InputField label="Location" value={location} onChangeText={setLocation} leftIcon="location-outline" />
        {user.role === 'owner' ? (
          <InputField
            label="About (shown on your public owner profile)"
            placeholder="Tell renters a bit about yourself..."
            value={bio}
            onChangeText={setBio}
            multiline
            style={{ height: 90, textAlignVertical: 'top' }}
          />
        ) : null}

        <PrimaryButton
          label="Save Changes"
          onPress={onSave}
          loading={saving}
          disabled={saving || (nameTouched && phoneTouched && !isValid)}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  changePhotoText: { ...typography.bodySm, color: colors.primaryDark, fontWeight: '600', marginTop: spacing.sm },
  progressTrack: { width: 160, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.info, borderRadius: 2 },
  progressText: { ...typography.caption, color: colors.textSecondary, marginTop: 6 },
});
