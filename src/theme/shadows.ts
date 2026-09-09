import { Platform } from 'react-native';
import { colors } from './colors';

const build = (elevation: number, opacity: number, radius: number, height: number) =>
  Platform.select({
    ios: {
      shadowColor: colors.black,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height },
    },
    android: { elevation },
    default: {},
  });

export const shadows = {
  none: {},
  xs: build(1, 0.05, 3, 1),
  sm: build(3, 0.08, 6, 2),
  md: build(6, 0.1, 12, 4),
  lg: build(10, 0.14, 20, 8),
};
