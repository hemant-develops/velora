import React, { useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderGestureState, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  step?: number;
  onChange: (min: number, max: number) => void;
  formatValue?: (v: number) => string;
}

const THUMB_SIZE = 26;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

// Hand-rolled two-thumb range slider -- no new dependency (everything used
// here, View/PanResponder/Animated-free gesture tracking, ships with
// react-native itself). Each thumb is dragged relative to its OWN starting
// pixel position (the standard PanResponder pattern), so it works
// identically no matter where the slider sits on screen, and doesn't
// require measuring absolute page coordinates.
export const RangeSlider: React.FC<Props> = ({ min, max, valueMin, valueMax, step = 1, onChange, formatValue }) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const range = Math.max(max - min, 1);
  const dragStartLeft = useRef(0);

  const toLeft = (v: number): number => (trackWidth <= 0 ? 0 : ((clamp(v, min, max) - min) / range) * trackWidth);
  const toValue = (left: number): number => {
    const raw = min + (clamp(left, 0, trackWidth) / (trackWidth || 1)) * range;
    return clamp(Math.round(raw / step) * step, min, max);
  };

  // Recreated each render (cheap -- this is a filter screen, not a hot
  // list) so the closures inside always see the LATEST valueMin/valueMax/
  // trackWidth rather than stale values captured once in a ref.
  const minResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStartLeft.current = toLeft(valueMin);
    },
    onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const nextValue = toValue(dragStartLeft.current + gesture.dx);
      const clamped = clamp(nextValue, min, valueMax - step);
      if (clamped !== valueMin) onChange(clamped, valueMax);
    },
  });

  const maxResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragStartLeft.current = toLeft(valueMax);
    },
    onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const nextValue = toValue(dragStartLeft.current + gesture.dx);
      const clamped = clamp(nextValue, valueMin + step, max);
      if (clamped !== valueMax) onChange(valueMin, clamped);
    },
  });

  const minLeft = toLeft(valueMin);
  const maxLeft = toLeft(valueMax);
  const label = (v: number) => (formatValue ? formatValue(v) : String(v));

  return (
    <View>
      <View style={styles.labelsRow}>
        <Text style={styles.valueLabel}>{label(valueMin)}</Text>
        <Text style={styles.valueLabel}>{label(valueMax)}</Text>
      </View>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        <View style={styles.trackBg} />
        <View style={[styles.trackFill, { left: minLeft, width: Math.max(maxLeft - minLeft, 0) }]} />
        <View
          {...minResponder.panHandlers}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={[styles.thumb, { left: minLeft - THUMB_SIZE / 2 }]}
        />
        <View
          {...maxResponder.panHandlers}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={[styles.thumb, { left: maxLeft - THUMB_SIZE / 2 }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  valueLabel: { ...typography.titleMd, color: colors.textPrimary },
  track: { height: THUMB_SIZE, justifyContent: 'center', marginHorizontal: THUMB_SIZE / 2 },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.border },
  trackFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    elevation: 2,
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
