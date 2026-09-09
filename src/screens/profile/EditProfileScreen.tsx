import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  // Local preview only until Save — reusing the same picker/persistence
  // pattern already proven in OwnerAddCarScreen (local image URI, no remote
  // upload service). Nothing is written to the account until onSave calls
  // updateProfile.
  const [avatarUri, setAvatarUri] = useState(user?.avatar ?? '');
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
      setAvatarUri(result.assets[0].uri);
    }
  };

  const onSave = async () => {
    setNameTouched(true);
    setPhoneTouched(true);
    if (!isValid) return;

    setSaving(true);
    // Only ever writes trimmed, already-validated values — never falls back
    // to silently keeping the old value when what's on screen is invalid,
    // since onSave already bails out above in that case.
    await updateProfile({
      name: name.trim(),
      phone: phone.trim(),
      location: location.trim() || user.location,
      avatar: avatarUri || user.avatar,
      ...(user.role === 'owner' ? { bio: bio.trim() } : null),
    });
    setSaving(false);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
    </View>
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
