import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

interface Props extends Omit<ImageProps, 'source' | 'style' | 'onError'> {
  uri: string | undefined | null;
  style?: StyleProp<ImageStyle>;
  iconSize?: number;
}

// Drop-in replacement for `<Image source={{ uri }} />` used for every
// vehicle/listing photo in the app. Remote car photos are hotlinked from
// external URLs the app doesn't control, so a broken link, a slow/offline
// connection, or a since-removed listing photo would otherwise leave a
// blank (or, on some platforms, a small red-X) hole in the layout. This
// component instead renders a themed placeholder in exactly the same
// `style` footprint (so surrounding layout never shifts and aspect ratio
// is preserved), and never lets a failed image load crash or blank out
// the screen.
export const FallbackImage: React.FC<Props> = ({ uri, style, iconSize = 28, ...imageProps }) => {
  const [hasError, setHasError] = useState(!uri);

  // A FlatList (car carousels, "My Rents" lists, etc.) recycles the same
  // component instance across different items, so the error flag from a
  // previous item's broken image must not leak onto the next item that
  // reuses this instance - reset whenever the uri itself changes.
  useEffect(() => {
    setHasError(!uri);
  }, [uri]);

  if (hasError) {
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="car-sport-outline" size={iconSize} color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: uri as string }}
      style={style}
      onError={() => setHasError(true)}
      {...imageProps}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
