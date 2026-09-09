import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { FallbackImage } from './FallbackImage';

interface Props {
  images: string[];
  height?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ImageCarousel: React.FC<Props> = ({ images, height = 340 }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<string>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  };

  return (
    <View style={{ height }}>
      <FlatList
        ref={listRef}
        data={images}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => <FallbackImage uri={item} style={{ width: SCREEN_WIDTH, height }} iconSize={40} />}
      />
      {images.length > 1 ? (
        <View style={styles.dotsRow}>
          {images.map((_, idx) => (
            <View key={idx} style={[styles.dot, idx === activeIndex ? styles.dotActive : undefined]} />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  dotActive: { backgroundColor: colors.white, width: 18 },
});
