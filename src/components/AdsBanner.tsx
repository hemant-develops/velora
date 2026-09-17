import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { supabase } from '../lib/supabase';

// ADMIN CONNECT -- reads public.ads (admin-managed, see velora-admin's Ads
// page) via the active-only RLS policy added in 0019_admin_app_connect.sql,
// filtered to the 'home_banner' placement. Renders nothing at all if there
// are no active ads for this placement, so an app with no ads configured
// looks exactly as it did before this existed.
interface AdRow {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
}

interface Props {
  placement?: string;
}

export const AdsBanner: React.FC<Props> = ({ placement = 'home_banner' }) => {
  const [ads, setAds] = useState<AdRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('ads')
      .select('id, title, image_url, link_url')
      .eq('placement', placement)
      .order('display_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.log(`VELORA_ADS_FETCH_ERROR: ${error.message}`);
          setAds([]);
        } else {
          setAds((data ?? []) as AdRow[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  if (ads.length === 0) return null;

  const onPressAd = (ad: AdRow) => {
    if (ad.link_url) Linking.openURL(ad.link_url).catch(() => {});
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: spacing.lg, marginHorizontal: -spacing.lg }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg }}
    >
      {ads.map((ad) => (
        <Pressable key={ad.id} onPress={() => onPressAd(ad)} style={[styles.card, shadows.sm]} disabled={!ad.link_url}>
          {ad.image_url ? (
            <Image source={{ uri: ad.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Text style={styles.imageFallbackText}>{ad.title}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 280,
    height: 120,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  image: { width: '100%', height: '100%' },
  imageFallback: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  imageFallbackText: { ...typography.titleMd, color: colors.textPrimary, textAlign: 'center' },
});
