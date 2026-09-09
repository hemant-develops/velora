import { colors } from './colors';
import { typography } from './typography';
import { spacing, radii, buttonHeights, TAB_BAR_HEIGHT } from './spacing';
import { shadows } from './shadows';

export const theme = {
  colors,
  typography,
  spacing,
  radii,
  buttonHeights,
  shadows,
  TAB_BAR_HEIGHT,
};

export type Theme = typeof theme;
export { colors, typography, spacing, radii, buttonHeights, shadows, TAB_BAR_HEIGHT };
