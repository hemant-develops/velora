import React, { useState } from 'react';
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
  // A FlatList (car carousels, "My Rents" lists, ...) recycles the same
  // component instance across different items -- and the SAME instance is
  // reused for the SAME car after an edit changes its photo -- so the error
  // flag from a previous/old uri must never leak onto a new one.
  //
  // PRODUCTION-AUDIT FIX -- this reset used to happen in a useEffect keyed on
  // `uri`, which runs AFTER the render commits: the very first render after
  // a broken-image uri is replaced by a real new one (e.g. right after
  // editing a car's photo) still painted with the OLD `hasError` value for
  // one frame, showing the placeholder icon before flipping to the real
  // photo on the next render. Resetting synchronously during render (React's
  // documented pattern for state that must follow a changed prop) removes
  // that dead frame entirely -- the very first render with a new uri already
  // has the correct hasError value.
  const [trackedUri, setTrackedUri] = useState(uri);
  if (uri !== trackedUri) {
    setTrackedUri(uri);
    setHasError(!uri);
  }

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
