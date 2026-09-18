import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'StoreSettings'>;

const WEBSITE_ORIGIN = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://velora.com').replace(/\/$/, '');

// OWNER STORE -- "/owners/{slug}" from the product spec
// (0028_owner_stores.sql). A subscribed owner already gets a store
// automatically (see verify-subscription-payment's ensureOwnerStore) --
// this screen is where they personalize it. The slug itself is never
// editable here: it's permanent once created (a store's public URL must
// stay stable once Google has indexed it), only store_name/description/
// policies can change, exactly what upsert_owner_store() allows.
export const StoreSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | undefined>();
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [policies, setPolicies] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('owner_stores')
      .select('slug, store_name, description, policies')
      .eq('owner_id', user.id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.log(`VELORA_STORE_SETTINGS_FETCH_ERROR: ${fetchError.message}`);
        } else if (data) {
          setSlug(data.slug);
          setStoreName(data.store_name);
          setDescription(data.description ?? '');
          setPolicies(data.policies ?? '');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) return null;

  const onSave = async () => {
    if (!storeName.trim()) {
      setError('Enter a store name.');
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase.rpc('upsert_owner_store', {
        p_store_name: storeName.trim(),
        p_description: description.trim(),
        p_policies: policies.trim(),
      });
      if (saveError) {
        setError(saveError.message);
        return;
      }
      const resultSlug = Array.isArray(data) ? data[0]?.slug : data?.slug;
      if (resultSlug) setSlug(resultSlug);
      Alert.alert('Store updated', 'Your VELORA store page has been updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your store. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="My Store" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primaryDark} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          {slug ? (
            <Pressable onPress={() => Linking.openURL(`${WEBSITE_ORIGIN}/owners/${slug}`)} style={styles.slugCard}>
              <Ionicons name="storefront-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.slugText} numberOfLines={1}>
                velora.com/owners/{slug}
              </Text>
              <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}

          {slug ? (
            <PrimaryButton
              label="Open Public Store"
              onPress={() => Linking.openURL(`${WEBSITE_ORIGIN}/owners/${slug}`)}
              variant="outline"
              icon={<Ionicons name="open-outline" size={18} color={colors.textPrimary} />}
              style={{ marginBottom: spacing.md }}
            />
          ) : null}

          <InputField label="Store Name" placeholder="e.g. Royal Cars Kota" value={storeName} onChangeText={setStoreName} />

          <InputField
            label="Description"
            placeholder="Tell customers about your business..."
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 100, textAlignVertical: 'top' }}
          />

          <InputField
            label="Policies (optional)"
            placeholder="e.g. cancellation policy, fuel policy, deposit..."
            value={policies}
            onChangeText={setPolicies}
            multiline
            style={{ height: 100, textAlignVertical: 'top' }}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? 'Saving…' : 'Save Store'} onPress={onSave} loading={saving} disabled={saving} style={{ marginTop: spacing.md }} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slugCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  slugText: { ...typography.bodySm, color: colors.primaryDark, flex: 1, fontWeight: '600' },
  error: { ...typography.bodySm, color: colors.danger, marginTop: spacing.sm },
});
